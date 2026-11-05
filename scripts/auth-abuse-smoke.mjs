// Saturates authentication quotas. Run ONLY against a disposable validation deployment.
// CI sets cooldown to 2 seconds; normal deployments default to 60 seconds.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

assert.equal(process.env.PIOS_AUTH_SMOKE_DISPOSABLE, 'true', 'Set PIOS_AUTH_SMOKE_DISPOSABLE=true only for a disposable deployment.');
const base = process.env.PIOS_TEST_API_URL || 'http://localhost:8080/api/v1';
let cookie = '', csrf;
async function request(path, body, extraHeaders = {}) {
  if (!csrf) {
    const response = await fetch(base + '/auth/csrf', { headers: { Cookie: cookie } });
    assert.equal(response.status, 200);
    cookie = response.headers.getSetCookie().find(value => value.startsWith('JSESSIONID='))?.split(';')[0] || cookie;
    csrf = await response.json();
  }
  const response = await fetch(base + '/auth/' + path, { method: 'POST', redirect: 'error',
    headers: { Cookie: cookie, 'Content-Type': 'application/json', [csrf.headerName]: csrf.token, ...extraHeaders }, body: JSON.stringify(body) });
  cookie = response.headers.getSetCookie().find(value => value.startsWith('JSESSIONID='))?.split(';')[0] || cookie;
  if (response.ok) csrf = undefined;
  const data = await response.json();
  return { status: response.status, data, retry: Number(response.headers.get('Retry-After')) };
}
const email = `pios-auth-smoke-${randomUUID()}@example.com`, password = randomUUID() + 'Aa1!';
assert.equal((await request('session/register', { displayName: 'Auth Smoke', email, password })).status, 201);
assert.equal((await request('login', { email, password })).status, 200);
assert.equal((await request('session/login', { email, password })).status, 200);
for (let i = 0; i < 5; i++) assert.equal((await request(i % 2 ? 'login' : 'session/login', { email, password: 'wrong-password' })).status, 401);
const blocked = await request('session/login', { email, password });
assert.equal(blocked.status, 429);
assert(blocked.retry > 0 && blocked.retry <= 3, 'Use a 2-second cooldown only in this disposable smoke deployment.');
assert.match(blocked.data.message, /Too many attempts/);
await new Promise(resolve => setTimeout(resolve, blocked.retry * 1000 + 150));
assert.equal((await request('session/login', { email, password })).status, 200, 'valid login recovers after cooldown');

const missing = `missing-${randomUUID()}@example.com`;
for (let i = 0; i < 5; i++) {
  const result = await request('login', { email: missing, password: 'wrong-password' });
  assert.equal(result.status, 401); assert.equal(result.data.message, 'Email or password is incorrect.');
}
assert.equal((await request('session/login', { email: missing, password })).status, 429);
for (const operation of ['login', 'register']) {
  let limited = false;
  for (let i = 0; i < 35; i++) {
    const result = await request(i % 2 ? operation : 'session/' + operation, {});
    if (result.status === 429) { assert(result.retry > 0); limited = true; break; }
    assert.equal(result.status, 400);
  }
  assert(limited, operation + ' IP quota enforced');
  assert.equal((await request(operation, {}, { 'X-Forwarded-For': '192.0.2.99', Forwarded: 'for=192.0.2.99' })).status, 429);
}
console.log('PASS: real database/browser and legacy auth routes, failed-login cooldown and recovery, unknown-account parity, shared IP quotas and forwarding-header resistance.');
