import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
const args = process.argv.slice(2), options = {};
while (args.length) {
    const name = args.shift();
    if (!name.startsWith('--'))
        throw new Error('Use --repo/--output options.');
    options[name.slice(2)] = args.shift();
}
const repo = options.repo || 'tiwariankitk5/personal-intelligence-os', output = path.resolve(options.output || '.recovery/keys/recovered-key.txt');
if (!/^[\w.-]+\/[\w.-]+$/.test(repo))
    throw new Error('Invalid repository.');
if (fs.existsSync(output))
    throw new Error('Key output already exists; choose another output file.');
const env = { ...process.env };
delete env.GH_DEBUG;
delete env.DEBUG;
function gh(args, input) { try {
    return execFileSync('gh', args, { input, env, encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}
catch {
    throw new Error('GitHub recovery request failed. Check gh auth status and repository write access.');
} }
function api(method, route, data) { const argv = ['api', '--method', method, 'repos/' + repo + '/' + route]; if (data)
    argv.push('--input', '-'); const text = gh(argv, data ? JSON.stringify(data) : undefined); return text ? JSON.parse(text) : null; }
let branch, artifact;
try {
    const metadata = JSON.parse(gh(['api', 'repos/' + repo]));
    if (!metadata.private || !metadata.permissions?.push)
        throw new Error('Key recovery requires a private repository and write access.');
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim();
    branch = 'recovery/key-request-' + randomUUID();
    api('POST', 'git/refs', { ref: 'refs/heads/' + branch, sha });
    const created = api('PUT', 'contents/.github/recovery-key-request.json', { branch, message: 'Request protected PIOS recovery key', content: Buffer.from(JSON.stringify({ nonce: randomUUID(), requestedAt: new Date().toISOString() })).toString('base64') });
    console.log('Waiting for the private recovery-key workflow...');
    let run;
    for (let i = 0; i < 90; i++) {
        const runs = JSON.parse(gh(['run', 'list', '--repo', repo, '--commit', created.commit.sha, '--json', 'databaseId,workflowName,status,conclusion', '--limit', '20']));
        run = runs.find(item => item.workflowName === 'Recover PIOS key');
        if (run?.status === 'completed')
            break;
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
    if (run?.conclusion !== 'success')
        throw new Error('Recovery-key workflow did not succeed; inspect GitHub Actions.');
    const artifacts = api('GET', 'actions/runs/' + run.databaseId + '/artifacts');
    artifact = artifacts.artifacts.find(item => item.name === 'pios-recovery-key');
    if (!artifact)
        throw new Error('Recovery key artifact not found.');
    const dir = path.dirname(output);
    fs.mkdirSync(dir, { recursive: true });
    const staging = fs.mkdtempSync(path.join(dir, 'key-download-'));
    try {
        gh(['run', 'download', String(run.databaseId), '--repo', repo, '--name', 'pios-recovery-key', '--dir', staging]);
        const text = fs.readFileSync(path.join(staging, 'recovery-key.txt'), 'utf8').trim();
        if (Buffer.from(text, 'base64').length !== 32)
            throw new Error('Invalid recovered key.');
        fs.writeFileSync(output, text + '\n', { flag: 'wx', mode: 0o600 });
        fs.unlinkSync(path.join(staging, 'recovery-key.txt'));
        fs.rmdirSync(staging);
    }
    catch (error) {
        throw error;
    }
    api('DELETE', 'actions/artifacts/' + artifact.id);
    artifact = null;
    console.log('Protected recovery key downloaded to ' + output + '. Temporary cloud artifact removed.');
}
catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
finally {
    if (branch) {
        try {
            api('DELETE', 'git/refs/heads/' + branch);
        }
        catch {
            console.error('Temporary key-request branch could not be removed.');
        }
    }
}
