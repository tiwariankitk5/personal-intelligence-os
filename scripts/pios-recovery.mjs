import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { readKey, encrypt, decrypt, sha256, validateArchiveNames } from './recovery-crypto.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), privateRoot = path.join(root, '.recovery');
const args = process.argv.slice(2), action = args.shift(), options = {};
while (args.length) {
    const name = args.shift();
    if (!name.startsWith('--'))
        throw new Error('Use named --options.');
    options[name.slice(2)] = ['publish-key', 'disable-workers'].includes(name.slice(2)) ? true : args.shift();
}
const repo = options.repo || 'tiwariankitk5/personal-intelligence-os';
if (!/^[\w.-]+\/[\w.-]+$/.test(repo))
    throw new Error('Invalid repository.');
const childEnv = { ...process.env };
delete childEnv.GH_DEBUG;
delete childEnv.DEBUG;
function run(exe, argv, { input, log } = {}) {
    try {
        const output = execFileSync(exe, argv, { cwd: root, input, env: childEnv, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
        if (log)
            fs.writeFileSync(log, output);
        return output.trim();
    }
    catch (error) {
        if (log)
            fs.writeFileSync(log, (error.stdout || '') + '\n' + (error.stderr || ''));
        throw new Error(exe + ' failed' + (log ? '; details in ' + path.relative(root, log) : ''));
    }
}
function compose(project, envFile, ...argv) { return run('docker', ['compose', '--env-file', envFile, '-p', project, ...argv]); }
function projectName(value) {
    if (!/^[a-z0-9][a-z0-9_-]+$/.test(value))
        throw new Error('Invalid Compose project.');
    return value;
}
function safeRemoveWork(dir) {
    const resolved = path.resolve(dir);
    if (!resolved.startsWith(privateRoot + path.sep) || !path.basename(resolved).startsWith('work-'))
        throw new Error('Refusing unsafe cleanup.');
    fs.rmSync(resolved, { recursive: true, force: true });
}
function assertPrivate() {
    const data = JSON.parse(run('gh', ['api', 'repos/' + repo]));
    if (!data.private)
        throw new Error('Recovery publishing/key operations require a private repository.');
    return data;
}
async function pipe(exe, argv, destination) { const output = fs.createWriteStream(destination, { flags: 'wx', mode: 0o600 }); const child = spawn(exe, argv, { cwd: root, env: childEnv, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); let errors = ''; child.stderr.on('data', chunk => { errors += chunk; }); const exited = new Promise((resolve, reject) => { child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(new Error(exe + ' backup command failed'))); }); await Promise.all([pipeline(child.stdout, output), exited]); }
function port(project, envFile, service, containerPort) {
    const result = compose(project, envFile, 'port', service, String(containerPort));
    const value = Number(result.match(/:(\d+)$/)?.[1]);
    if (!value)
        throw new Error('Cannot determine ' + service + ' port.');
    return value;
}
function tableState(project, envFile) {
    const tables = compose(project, envFile, 'exec', '-T', 'db', 'psql', '-U', 'pios', '-d', 'pios', '-At', '-c', "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename").split(/\r?\n/).filter(Boolean);
    const result = {};
    for (const table of tables) {
        const quoted = '"' + table.replaceAll('"', '""') + '"';
        result[table] = JSON.parse(compose(project, envFile, 'exec', '-T', 'db', 'psql', '-U', 'pios', '-d', 'pios', '-At', '-c', "SELECT json_build_object('count',count(*),'digest',md5(coalesce(string_agg(to_jsonb(t)::text,chr(10) ORDER BY to_jsonb(t)::text),''))) FROM public." + quoted + ' t'));
    }
    return result;
}
function checkTar(file, compressed = false) {
    validateArchiveNames(run('tar', [compressed ? '-tzf' : '-tf', file]));
    const verbose = run('tar', [compressed ? '-tvzf' : '-tvf', file]);
    for (const line of verbose.split(/\r?\n/).filter(Boolean))
        if (!/^[-d]/.test(line))
            throw new Error('Only regular files and directories are allowed in recovery archives.');
}
async function workDir() { await fsp.mkdir(privateRoot, { recursive: true }); return fsp.mkdtemp(path.join(privateRoot, 'work-')); }
async function unpack(archive, keyFile, dir) {
    const tar = path.join(dir, 'payload.tar');
    await decrypt(path.resolve(archive), tar, readKey(keyFile));
    checkTar(tar);
    const payload = path.join(dir, 'payload');
    fs.mkdirSync(payload);
    run('tar', ['-xf', tar, '-C', payload]);
    const manifest = JSON.parse(fs.readFileSync(path.join(payload, 'manifest.json'), 'utf8'));
    if (manifest.format !== 'pios-recovery-v1')
        throw new Error('Unsupported manifest.');
    for (const [name, expected] of Object.entries(manifest.files)) {
        validateArchiveNames(name);
        if (await sha256(path.join(payload, name)) !== expected)
            throw new Error('Backup checksum mismatch.');
    }
    checkTar(path.join(payload, 'uploads.tar.gz'), true);
    return { payload, manifest };
}
async function backup() {
    const project = projectName(options.project || 'personal-intelligence-os'), envFile = path.join(root, '.env');
    if (!fs.existsSync(envFile))
        throw new Error('Local .env is required for a full recovery snapshot.');
    const keyFile = path.resolve(options['key-file'] || path.join(privateRoot, 'keys', 'recovery-key.txt'));
    fs.mkdirSync(path.dirname(keyFile), { recursive: true });
    if (!fs.existsSync(keyFile)) {
        if (options['publish-key']) {
            assertPrivate();
            const names = JSON.parse(run('gh', ['secret', 'list', '--repo', repo, '--json', 'name']));
            if (names.some(item => item.name === 'PIOS_RECOVERY_KEY'))
                throw new Error('A remote recovery key already exists. Retrieve it instead of rotating it.');
        }
        fs.writeFileSync(keyFile, randomBytes(32).toString('base64') + '\n', { flag: 'wx', mode: 0o600 });
    }
    const key = readKey(keyFile);
    if (options['publish-key']) {
        assertPrivate();
        const names = JSON.parse(run('gh', ['secret', 'list', '--repo', repo, '--json', 'name']));
        const id = createHash('sha256').update(key).digest('hex');
        if (names.some(item => item.name === 'PIOS_RECOVERY_KEY')) {
            let saved = '';
            try {
                saved = run('gh', ['variable', 'get', 'PIOS_RECOVERY_KEY_ID', '--repo', repo]);
            }
            catch { }
            if (saved !== id)
                throw new Error('Remote key differs or has no verified fingerprint. Retrieve it before making another backup.');
        }
        else {
            run('gh', ['secret', 'set', 'PIOS_RECOVERY_KEY', '--repo', repo], { input: key.toString('base64') });
            run('gh', ['variable', 'set', 'PIOS_RECOVERY_KEY_ID', '--repo', repo, '--body', id]);
        }
        console.log('Recovery key stored as a protected repository secret.');
    }
    const output = path.resolve(options.output || path.join(privateRoot, 'snapshots', 'pios-data-' + Date.now() + '.piosbackup'));
    fs.mkdirSync(path.dirname(output), { recursive: true });
    if (fs.existsSync(output))
        throw new Error('Backup output already exists.');
    const dir = await workDir();
    let stopped = false;
    try {
        const payload = path.join(dir, 'payload');
        fs.mkdirSync(payload);
        const manifest = { format: 'pios-recovery-v1', createdAt: new Date().toISOString(), commit: run('git', ['rev-parse', 'HEAD']), project, ports: { frontend: port(project, envFile, 'frontend', 3000), backend: port(project, envFile, 'backend', 8080), db: port(project, envFile, 'db', 5432) }, files: {} };
        const running = compose(project, envFile, 'ps', '--status', 'running', '--services').split(/\r?\n/);
        if (!running.includes('db') || !running.includes('backend'))
            throw new Error('The normal database and backend must be running.');
        console.log('Pausing backend writes for a consistent database/upload snapshot.');
        compose(project, envFile, 'stop', 'backend');
        stopped = true;
        await pipe('docker', ['compose', '--env-file', envFile, '-p', project, 'exec', '-T', 'db', 'pg_dump', '-U', 'pios', '-d', 'pios', '--format=custom', '--no-owner', '--no-acl'], path.join(payload, 'database.dump'));
        manifest.tables = tableState(project, envFile);
        const backend = compose(project, envFile, 'ps', '-aq', 'backend');
        await pipe('docker', ['run', '--rm', '--volumes-from', backend, '--entrypoint', 'tar', 'pgvector/pgvector:pg16', '-czf', '-', '-C', '/app/data/uploads', '.'], path.join(payload, 'uploads.tar.gz'));
        fs.copyFileSync(envFile, path.join(payload, '.env'));
        run('git', ['bundle', 'create', path.join(payload, 'source.bundle'), '--all']);
        const evidence = path.join(payload, 'evidence');
        fs.mkdirSync(evidence);
        const validation = path.join(root, '.validation');
        if (fs.existsSync(validation))
            for (const entry of fs.readdirSync(validation, { withFileTypes: true }))
                if (entry.isFile() && /\.(png|webm|json|log|cjs|mjs|html|md|txt)$/.test(entry.name))
                    fs.copyFileSync(path.join(validation, entry.name), path.join(evidence, entry.name));
        const references = ['C:/Users/ankit/AppData/Local/Packages/Microsoft.ScreenSketch_8wekyb3d8bbwe/TempState/Recordings/20261105-1646-47.1508227.mp4', 'C:/Users/ankit/AppData/Local/Packages/Microsoft.ScreenSketch_8wekyb3d8bbwe/TempState/Recordings/20261105-1733-42.6867943.mp4'];
        fs.mkdirSync(path.join(payload, 'references'));
        for (const source of references)
            if (fs.existsSync(source))
                fs.copyFileSync(source, path.join(payload, 'references', path.basename(source)));
        function files(folder, prefix = '') { return fs.readdirSync(folder, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(folder, entry.name), prefix + entry.name + '/') : [prefix + entry.name]); }
        for (const name of files(payload))
            manifest.files[name] = await sha256(path.join(payload, name));
        fs.writeFileSync(path.join(payload, 'manifest.json'), JSON.stringify(manifest, null, 2));
        compose(project, envFile, 'start', 'backend');
        stopped = false;
        console.log('Backend restarted; sign in again if asked.');
        const tar = path.join(dir, 'payload.tar');
        run('tar', ['-cf', tar, '-C', payload, '.']);
        await encrypt(tar, output, key);
        fs.writeFileSync(output + '.sha256', (await sha256(output)) + '  ' + path.basename(output) + '\n');
        console.log('Encrypted backup: ' + path.relative(root, output));
        console.log('Recovery key file: ' + path.relative(root, keyFile));
    }
    finally {
        if (stopped)
            compose(project, envFile, 'start', 'backend');
        safeRemoveWork(dir);
    }
}
async function verify() {
    const dir = await workDir();
    try {
        const { manifest } = await unpack(options.input, options['key-file'], dir);
        console.log('Verified authenticated backup and ' + Object.keys(manifest.files).length + ' payload checksums.');
    }
    finally {
        safeRemoveWork(dir);
    }
}
async function restore() {
    const project = projectName(options.project || 'pios-recovered');
    if (run('docker', ['ps', '-aq', '--filter', 'label=com.docker.compose.project=' + project]) || run('docker', ['volume', 'ls', '-q', '--filter', 'label=com.docker.compose.project=' + project]))
        throw new Error('Restore requires a fresh project with no existing containers or volumes.');
    const envOutput = path.resolve(options['env-output'] || path.join(root, '.env'));
    if (fs.existsSync(envOutput))
        throw new Error('Refusing to overwrite an existing environment file; use --env-output for an isolated restore.');
    const dir = await workDir();
    try {
        const { payload, manifest } = await unpack(options.input, options['key-file'], dir);
        let env = fs.readFileSync(path.join(payload, '.env'), 'utf8');
        const ports = { frontend: Number(options['frontend-port'] || manifest.ports.frontend), backend: Number(options['backend-port'] || manifest.ports.backend), db: Number(options['db-port'] || manifest.ports.db) };
        for (const value of Object.values(ports))
            if (!Number.isInteger(value) || value < 1024 || value > 65535)
                throw new Error('Use valid local ports 1024..65535.');
        if (new Set(Object.values(ports)).size !== 3)
            throw new Error('Service ports must differ.');
        function setting(name, value) { env = env.replace(new RegExp('^' + name + '=.*$', 'gm'), ''); env += '\n' + name + '=' + value + '\n'; }
        setting('PIOS_FRONTEND_PORT', ports.frontend);
        setting('PIOS_BACKEND_PORT', ports.backend);
        setting('PIOS_DB_PORT', ports.db);
        if (options['disable-workers'])
            setting('PIOS_RAG_WORKER_ENABLED', 'false');
        fs.mkdirSync(path.dirname(envOutput), { recursive: true });
        fs.writeFileSync(envOutput, env, { flag: 'wx', mode: 0o600 });
        compose(project, envOutput, 'up', '-d', 'db');
        let ready = false;
        for (let i = 0; i < 60; i++) {
            try {
                compose(project, envOutput, 'exec', '-T', 'db', 'pg_isready', '-U', 'pios', '-d', 'pios');
                ready = true;
                break;
            }
            catch {
                await new Promise(r => setTimeout(r, 1000));
            }
        }
        if (!ready)
            throw new Error('Restore database did not become ready.');
        const db = compose(project, envOutput, 'ps', '-q', 'db');
        const count = compose(project, envOutput, 'exec', '-T', 'db', 'psql', '-U', 'pios', '-d', 'pios', '-At', '-c', "SELECT count(*) FROM pg_tables WHERE schemaname='public'");
        if (count !== '0')
            throw new Error('Restore database is not empty.');
        run('docker', ['cp', path.join(payload, 'database.dump'), db + ':/tmp/pios-recovery.dump']);
        compose(project, envOutput, 'exec', '-T', 'db', 'pg_restore', '-U', 'pios', '-d', 'pios', '--no-owner', '--no-acl', '--exit-on-error', '/tmp/pios-recovery.dump');
        if (JSON.stringify(tableState(project, envOutput)) !== JSON.stringify(manifest.tables))
            throw new Error('Restored database does not match the snapshot.');
        compose(project, envOutput, 'build', 'backend');
        compose(project, envOutput, 'create', 'backend');
        const backend = compose(project, envOutput, 'ps', '-aq', 'backend'), uploads = path.join(dir, 'uploads');
        fs.mkdirSync(uploads);
        run('tar', ['-xzf', path.join(payload, 'uploads.tar.gz'), '-C', uploads]);
        run('docker', ['cp', uploads + path.sep + '.', backend + ':/app/data/uploads']);
        const copied = path.join(dir, 'verify-uploads');
        fs.mkdirSync(copied);
        run('docker', ['cp', backend + ':/app/data/uploads/.', copied]);
        async function fileHashes(folder, prefix = '') { const result = {}; for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
            const name = prefix + entry.name;
            if (entry.isDirectory())
                Object.assign(result, await fileHashes(path.join(folder, entry.name), name + '/'));
            else if (entry.isFile())
                result[name] = await sha256(path.join(folder, entry.name));
            else
                throw new Error('Unexpected upload file type.');
        } return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b))); }
        if (JSON.stringify(await fileHashes(uploads)) !== JSON.stringify(await fileHashes(copied)))
            throw new Error('Restored upload bytes do not match the snapshot.');
        console.log('Restored upload hashes matched the snapshot.');
        const artifacts = path.join(privateRoot, 'restored', project);
        fs.mkdirSync(artifacts, { recursive: true });
        for (const name of ['evidence', 'references'])
            if (fs.existsSync(path.join(payload, name)))
                fs.cpSync(path.join(payload, name), path.join(artifacts, name), { recursive: true, errorOnExist: true, force: false });
        fs.copyFileSync(path.join(payload, 'manifest.json'), path.join(artifacts, 'manifest.json'));
        compose(project, envOutput, 'up', '-d', '--build', 'backend', 'frontend');
        console.log('Database row counts/content digests matched the snapshot.');
        console.log('Restored project: ' + project + '; frontend http://localhost:' + ports.frontend);
        console.log('Environment: ' + path.relative(root, envOutput));
        console.log('Evidence/references: ' + path.relative(root, artifacts));
    }
    finally {
        safeRemoveWork(dir);
    }
}
if (!['backup', 'verify', 'restore'].includes(action))
    throw new Error('Usage: node scripts/pios-recovery.mjs backup|verify|restore --options');
try {
    await ({ backup, verify, restore }[action])();
}
catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
