import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getAuthCookieNames, handleLogin } from '../lib/server/auth.ts';

const csrf = 'a'.repeat(43);
function setup(t) {
  const previous = { ...process.env };
  Object.assign(process.env, {
    NODE_ENV: 'production',
    FRONTEND_URL: 'https://fixnear.example',
    FIXNEAR_API_BASE_URL: 'https://api.mock.invalid',
    SUPABASE_URL: 'https://auth.mock.invalid',
    SUPABASE_ANON_KEY: 'synthetic-key',
  });
  const oldFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = oldFetch;
    for (const key of [
      'NODE_ENV',
      'FRONTEND_URL',
      'FIXNEAR_API_BASE_URL',
      'SUPABASE_URL',
      'SUPABASE_ANON_KEY',
    ]) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });
}
function request({
  origin = 'https://fixnear.example',
  token = csrf,
  body = { email: ' USER@example.test ', password: 'example-pass' },
} = {}) {
  return new Request('https://fixnear.example/api/auth/login', {
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
test('login rate checks then exchanges credentials without returning tokens', async (t) => {
  setup(t);
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (calls.length === 1) return new Response(null, { status: 204 });
    return Response.json({
      access_token: 'secret-access',
      refresh_token: 'secret-refresh',
      expires_in: 1200,
      user: {
        id: 'user-1',
        email: 'user@example.test',
        email_confirmed_at: '2026-01-01T00:00:00Z',
      },
    });
  };
  const response = await handleLogin(request());
  assert.equal(response.status, 200);
  assert.equal(calls[0].url, 'https://api.mock.invalid/api/v1/auth/attempt');
  assert.equal(calls[1].url, 'https://auth.mock.invalid/auth/v1/token?grant_type=password');
  assert.deepEqual(JSON.parse(calls[1].init.body), {
    email: 'user@example.test',
    password: 'example-pass',
  });
  const payload = await response.text();
  assert.equal(payload.includes('secret-access'), false);
  assert.equal(payload.includes('secret-refresh'), false);
  const cookies = response.headers.getSetCookie();
  assert.equal(cookies.length, 2);
  assert.ok(
    cookies.every(
      (cookie) =>
        cookie.includes('HttpOnly') &&
        cookie.includes('Secure') &&
        cookie.includes('SameSite=Strict') &&
        cookie.includes('Path=/'),
    ),
  );
});
test('cross origin, bad csrf, invalid input and client roles are rejected before upstream', async (t) => {
  setup(t);
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(null, { status: 204 });
  };
  assert.equal((await handleLogin(request({ origin: 'https://evil.example' }))).status, 403);
  assert.equal((await handleLogin(request({ token: 'b'.repeat(43) }))).status, 403);
  assert.equal(
    (
      await handleLogin(
        request({ body: { email: 'a@example.test', password: 'pass', role: 'admin' } }),
      )
    ).status,
    400,
  );
  assert.equal(calls, 0);
});
test('gate failure and rate limiting fail closed without provider request', async (t) => {
  setup(t);
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(null, { status: 429, headers: { 'Retry-After': '12' } });
  };
  const r = await handleLogin(request());
  assert.equal(r.status, 429);
  assert.equal(r.headers.get('retry-after'), '12');
  assert.equal(calls, 1);
  globalThis.fetch = async () => {
    throw Error('offline');
  };
  assert.equal((await handleLogin(request())).status, 503);
});
test('unverified accounts and invalid passwords receive same error, no cookies', async (t) => {
  setup(t);
  let providerStatus = 200;
  globalThis.fetch = async (url) =>
    String(url).includes('/attempt')
      ? new Response(null, { status: 204 })
      : providerStatus === 200
        ? Response.json({
            access_token: 'secret',
            refresh_token: 'refresh',
            expires_in: 300,
            user: { id: 'u', email_confirmed_at: null },
          })
        : Response.json({ msg: 'sensitive provider error' }, { status: 400 });
  const unverified = await handleLogin(request());
  providerStatus = 400;
  const invalid = await handleLogin(request());
  assert.equal(unverified.status, 401);
  assert.equal(invalid.status, 401);
  assert.deepEqual(await unverified.json(), await invalid.json());
  assert.deepEqual(unverified.headers.getSetCookie(), []);
});
