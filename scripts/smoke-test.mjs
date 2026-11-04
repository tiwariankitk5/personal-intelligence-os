// Run against a disposable/local stack: node scripts/smoke-test.mjs
// Creates two test accounts. No provider calls or real credentials are needed.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const base = process.env.PIOS_TEST_API_URL || 'http://localhost:8080/api/v1';
function client() {
  let cookie = '';
  let csrf;
  async function request(path, { method = 'GET', body, expected = 200, protect = true } = {}) {
    if (protect && !['GET', 'HEAD', 'OPTIONS'].includes(method) && !csrf) {
      csrf = await request('/auth/csrf');
    }
    const headers = { Cookie: cookie };
    if (csrf && protect) headers[csrf.headerName] = csrf.token;
    if (body !== undefined && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const response = await fetch(base + path, {
      method, headers, redirect: 'error',
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
    for (const value of response.headers.getSetCookie()) {
      if (value.startsWith('JSESSIONID=')) {
        cookie = value.split(';')[0];
        if (response.status !== 204) {
          assert.match(value, /HttpOnly/i);
          assert.match(value, /SameSite=Lax/i);
        }
      }
    }
    assert.equal(response.status, expected, `${method} ${path}: unexpected HTTP status`);
    const text = await response.text();
    return text ? JSON.parse(text) : undefined;
  }
  return {
    request,
    async register() {
      const result = await request('/auth/session/register', {
        method: 'POST', expected: 201,
        body: { displayName: 'PIOS Smoke Test', email: `pios-smoke-${randomUUID()}@example.com`, password: randomUUID() + 'Aa1!' },
      });
      assert.equal(result.accessToken, undefined);
      csrf = undefined;
      return result;
    },
  };
}

const owner = client();
const other = client();
await owner.register();
await other.register();
await owner.request('/users/me');
await other.request('/users/me');
const folders = await owner.request('/folders');
assert(folders.length > 0);
const note = await owner.request('/notes', { method: 'POST', body: {
  title: 'PIOS smoke note', bodyHtml: '<p>Private knowledge</p><script>alert(1)</script>',
  folderId: folders[0].id, color: 'sage', pinned: false, archived: false, order: 0,
} });
assert(!note.bodyHtml.includes('<script'));
assert(!(await other.request('/notes')).some((row) => row.id === note.id));
await other.request(`/notes/${note.id}`, { method: 'DELETE', expected: 404 });
await owner.request(`/notes/${note.id}`, { method: 'DELETE' });

const source = await owner.request('/sources/text', {
  method: 'POST', body: { title: 'PIOS smoke text', content: 'Private retrieval material', collection: 'Smoke tests' },
});
assert(!(await other.request('/sources')).some((row) => row.id === source.id));
await other.request(`/sources/${source.id}`, { method: 'DELETE', expected: 404 });
await owner.request(`/sources/${source.id}`, { method: 'DELETE' });
assert(!(await owner.request('/sources')).some((row) => row.id === source.id));

const upload = new FormData();
upload.set('file', new Blob(['PIOS smoke document'], { type: 'text/plain' }), 'smoke.txt');
const uploaded = await owner.request('/sources/upload', { method: 'POST', body: upload });
await owner.request(`/sources/${uploaded.id}`, { method: 'DELETE' });

const objective = await owner.request('/learning/objectives', {
  method: 'POST', body: { title: 'PIOS smoke objective', description: '', category: 'Smoke tests' },
});
await other.request(`/learning/objectives/${objective.id}`, { method: 'DELETE', expected: 404 });
const updated = await owner.request(`/learning/objectives/${objective.id}`, { method: 'PATCH', body: { progress: 50 } });
assert.equal(updated.progress, 50);
await owner.request(`/learning/objectives/${objective.id}`, { method: 'DELETE' });

await owner.request('/auth/logout', { method: 'POST', protect: false, expected: 403 });
await owner.request('/users/me');
await owner.request('/auth/logout', { method: 'POST', expected: 204 });
await owner.request('/users/me', { expected: 401 });
await other.request('/auth/logout', { method: 'POST', expected: 204 });
console.log('PASS: session cookies, CSRF, private notes/sources/objectives, upload, deletion and logout.');
console.log('Two smoke-test accounts remain; run this against a disposable/local database.');
