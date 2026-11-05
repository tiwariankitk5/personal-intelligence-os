import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { encrypt, decrypt, validateArchiveNames } from './recovery-crypto.mjs';
const base = path.resolve('.recovery');
fs.mkdirSync(base, { recursive: true });
test('authenticated backup round trip and wrong-key/tamper rejection', async () => { const dir = fs.mkdtempSync(path.join(base, 'work-test-')); try {
    const input = path.join(dir, 'plain'), archive = path.join(dir, 'encrypted'), out = path.join(dir, 'restored'), key = randomBytes(32);
    fs.writeFileSync(input, 'synthetic database and environment');
    await encrypt(input, archive, key);
    assert(!fs.readFileSync(archive).includes(Buffer.from('synthetic database')));
    await decrypt(archive, out, key);
    assert.equal(fs.readFileSync(out, 'utf8'), fs.readFileSync(input, 'utf8'));
    fs.unlinkSync(out);
    await assert.rejects(decrypt(archive, out, randomBytes(32)));
    assert(!fs.existsSync(out));
    const bytes = fs.readFileSync(archive);
    bytes[24] ^= 1;
    fs.writeFileSync(archive, bytes);
    await assert.rejects(decrypt(archive, out, key));
    assert(!fs.existsSync(out));
}
finally {
    if (!dir.startsWith(base + path.sep))
        throw new Error('Unsafe test cleanup');
    fs.rmSync(dir, { recursive: true, force: true });
} });
test('archive path traversal is rejected on Windows and POSIX', () => { validateArchiveNames('./database.dump\n./evidence/demo.png'); for (const value of ['../escape', '/root/escape', 'C:/escape', 'a/../../escape', 'a\\..\\escape'])
    assert.throws(() => validateArchiveNames(value)); });
