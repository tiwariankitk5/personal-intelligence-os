import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
export const MAGIC = Buffer.from('PIOSREC1');
export function readKey(file) {
    const key = Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'base64');
    if (key.length !== 32)
        throw new Error('Recovery key must contain 32 base64-encoded bytes.');
    return key;
}
export async function sha256(file) {
    const hash = createHash('sha256');
    for await (const chunk of fs.createReadStream(file))
        hash.update(chunk);
    return hash.digest('hex');
}
export async function encrypt(input, output, key) { const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv); cipher.setAAD(MAGIC); const dest = fs.createWriteStream(output, { flags: 'wx', mode: 0o600 }); dest.write(Buffer.concat([MAGIC, iv])); await pipeline(fs.createReadStream(input), cipher, dest); await fsp.appendFile(output, cipher.getAuthTag()); }
export async function decrypt(input, output, key) {
    const stat = await fsp.stat(input);
    if (stat.size < 37)
        throw new Error('Invalid backup.');
    const handle = await fsp.open(input, 'r');
    const header = Buffer.alloc(20), tag = Buffer.alloc(16);
    try {
        await handle.read(header, 0, 20, 0);
        await handle.read(tag, 0, 16, stat.size - 16);
    }
    finally {
        await handle.close();
    }
    if (!header.subarray(0, 8).equals(MAGIC))
        throw new Error('Unsupported backup format.');
    const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(8));
    decipher.setAAD(MAGIC);
    decipher.setAuthTag(tag);
    const fd = fs.openSync(output, 'wx', 0o600);
    try {
        await pipeline(fs.createReadStream(input, { start: 20, end: stat.size - 17 }), decipher, fs.createWriteStream(output, { fd, autoClose: true }));
    }
    catch (error) {
        await fsp.rm(output, { force: true });
        throw new Error('Backup authentication failed; wrong key or damaged file.', { cause: error });
    }
}
export function validateArchiveNames(names) {
    for (const name of names.split(/\r?\n/).filter(Boolean)) {
        const normalized = name.replaceAll('\\', '/');
        if (normalized.startsWith('/') || /^[a-z]:/i.test(normalized) || normalized.split('/').includes('..'))
            throw new Error('Unsafe archive path.');
    }
}
