import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getAuthCookieNames,
  handlePasswordReset,
  handleRecoveryRequest,
} from '../lib/server/auth.ts';

const csrf = 'c'.repeat(43);
function setup(t) {
  const saved = { ...process.env };
  const fetch = globalThis.fetch;
  Object.assign(process.env, {
    NODE_ENV: 'production',
    FRONTEND_URL: 'https://fixnear.example',
    FIXNEAR_API_BASE_URL: 'https://api.mock.invalid',
    SUPABASE_URL: 'https://auth.mock.invalid',
    SUPABASE_ANON_KEY: 'example',
  });
  t.after(() => {
    globalThis.fetch = fetch;
    for (const k of [
      'NODE_ENV',
      'FRONTEND_URL',
      'FIXNEAR_API_BASE_URL',
      'SUPABASE_URL',
      'SUPABASE_ANON_KEY',
    ]) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });
}
function request(body, { origin = 'https://fixnear.example', token = csrf } = {}) {
  return new Request('https://fixnear.example/api/auth/recover', {
    method: 'POST',
    headers: {
      origin,
      'x-csrf-token': token,
      'content-type': 'application/json',
      cookie: `${getAuthCookieNames().csrf}=${csrf}`,
    },
    body: JSON.stringify(body),
  });
}
const body = {
  email: 'USER@example.test',
  otp: '123456',
  password: 'a-long-password',
  confirmPassword: 'a-long-password',
};

test('recovery request is enumeration-resistant for provider 200 and 400', async (t) => {
  setup(t);
  let status = 200;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return String(url).includes('/attempt')
      ? new Response(null, { status: 204 })
      : new Response('{}', { status });
  };
  const known = await handleRecoveryRequest(request({ email: ' USER@example.test ' }));
  status = 400;
  const unknown = await handleRecoveryRequest(request({ email: 'nobody@example.test' }));
  assert.equal(known.status, 200);
  assert.equal(unknown.status, 200);
  assert.deepEqual(await known.json(), await unknown.json());
  assert.deepEqual(JSON.parse(calls[1].init.body), { email: 'user@example.test' });
});

test('reset exchanges the OTP and updates password server-side without leaking tokens', async (t) => {
  setup(t);
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/verify'))
      return Response.json({
        access_token: 'recovery-access-secret',
        refresh_token: 'recovery-refresh-secret',
        expires_in: 300,
        user: { id: 'user', email: 'user@example.test' },
      });
    return new Response(null, { status: 204 });
  };
  const result = await handlePasswordReset(request(body));
  assert.equal(result.status, 200);
  assert.deepEqual(
    calls.map((item) => item.url),
    [
      'https://api.mock.invalid/api/v1/auth/attempt',
      'https://auth.mock.invalid/auth/v1/verify',
      'https://auth.mock.invalid/auth/v1/user',
      'https://auth.mock.invalid/auth/v1/logout',
    ],
  );
  assert.deepEqual(JSON.parse(calls[1].init.body), {
    email: 'user@example.test',
    token: '123456',
    type: 'recovery',
  });
  assert.equal(
    new Headers(calls[2].init.headers).get('authorization'),
    'Bearer recovery-access-secret',
  );
  assert.deepEqual(JSON.parse(calls[2].init.body), { password: 'a-long-password' });
  const text = await result.text();
  assert.ok(!text.includes('secret') && !text.includes('123456'));
  assert.equal(result.headers.getSetCookie().length, 2);
  assert.ok(
    result.headers
      .getSetCookie()
      .every((cookie) => cookie.includes('Max-Age=0') && cookie.includes('HttpOnly')),
  );
});

test('invalid or expired OTP is generic and cannot update password', async (t) => {
  setup(t);
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls++;
    return String(url).includes('/attempt')
      ? new Response(null, { status: 204 })
      : Response.json({ detail: 'sensitive' }, { status: 403 });
  };
  const result = await handlePasswordReset(request(body));
  assert.equal(result.status, 400);
  assert.deepEqual(await result.json(), { error: 'invalid_or_expired_code' });
  assert.equal(calls, 2);
});

test('csrf, password mismatch and unsupported fields fail before network', async (t) => {
  setup(t);
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(null, { status: 204 });
  };
  assert.equal(
    (await handlePasswordReset(request(body, { origin: 'https://evil.example' }))).status,
    403,
  );
  assert.equal(
    (await handleRecoveryRequest(request({ email: body.email }, { token: 'x'.repeat(43) }))).status,
    403,
  );
  assert.equal(
    (await handlePasswordReset(request({ ...body, confirmPassword: 'different' }))).status,
    400,
  );
  assert.equal((await handlePasswordReset(request({ ...body, role: 'admin' }))).status, 400);
  assert.equal(calls, 0);
});

test('rate gate rejects before provider and propagates Retry-After', async (t) => {
  setup(t);
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(null, { status: 429, headers: { 'retry-after': '42' } });
  };
  const result = await handleRecoveryRequest(request({ email: body.email }));
  assert.equal(result.status, 429);
  assert.equal(result.headers.get('retry-after'), '42');
  assert.equal(calls, 1);
});

test('provider session is signed out after an update error', async (t) => {
  setup(t);
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).endsWith('/verify'))
      return Response.json({
        access_token: 'a',
        refresh_token: 'r',
        expires_in: 300,
        user: { id: 'u' },
      });
    if (String(url).endsWith('/user')) throw new Error('offline');
    return new Response(null, { status: 204 });
  };
  const result = await handlePasswordReset(request(body));
  assert.equal(result.status, 503);
  assert.ok(calls.at(-1).endsWith('/logout'));
});
