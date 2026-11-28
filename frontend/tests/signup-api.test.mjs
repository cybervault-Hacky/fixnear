import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getAuthCookieNames,
  handleSignup,
  handleSignupResend,
  handleSignupVerification,
} from '../lib/server/auth.ts';
const csrf = 'a'.repeat(43);
function setup(t) {
  const env = { ...process.env };
  const oldFetch = globalThis.fetch;
  Object.assign(process.env, {
    NODE_ENV: 'production',
    FRONTEND_URL: 'https://fixnear.example',
    FIXNEAR_API_BASE_URL: 'https://api.mock.invalid',
    SUPABASE_URL: 'https://auth.mock.invalid',
    SUPABASE_ANON_KEY: 'synthetic',
  });
  t.after(() => {
    globalThis.fetch = oldFetch;
    for (const key of [
      'NODE_ENV',
      'FRONTEND_URL',
      'FIXNEAR_API_BASE_URL',
      'SUPABASE_URL',
      'SUPABASE_ANON_KEY',
    ]) {
      if (env[key] === undefined) delete process.env[key];
      else process.env[key] = env[key];
    }
  });
}
function req(body, origin = 'https://fixnear.example') {
  return new Request('https://fixnear.example/api/auth/signup', {
    method: 'POST',
    headers: {
      origin,
      'x-csrf-token': csrf,
      'content-type': 'application/json',
      cookie: `${getAuthCookieNames().csrf}=${csrf}`,
    },
    body: JSON.stringify(body),
  });
}
const signup = {
  fullName: 'Test Person',
  email: ' TEST@example.test ',
  password: 'strong-password',
  confirmPassword: 'strong-password',
  acceptedTerms: true,
};
const verify = { email: 'test@example.test', fullName: 'Test Person', otp: '123456' };
const providerResponse = {
  access_token: 'synthetic-access',
  refresh_token: 'synthetic-refresh',
  expires_in: 3600,
  user: { id: 'user-1', email: 'test@example.test', email_confirmed_at: '2026-01-01T00:00:00Z' },
};

test('signup normalizes email and returns same response for duplicate provider error', async (t) => {
  setup(t);
  let status = 200;
  let calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return String(url).endsWith('/attempt')
      ? new Response(null, { status: 204 })
      : new Response('{}', { status });
  };
  const first = await handleSignup(req(signup));
  status = 400;
  const duplicate = await handleSignup(req(signup));
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), await duplicate.json());
  assert.deepEqual(JSON.parse(calls[1].init.body), {
    email: 'test@example.test',
    password: 'strong-password',
  });
  assert.equal(calls[1].url, 'https://auth.mock.invalid/auth/v1/signup');
});

test('signup validation rejects roles, mismatched passwords, missing terms and cross origin before network', async (t) => {
  setup(t);
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(null, { status: 204 });
  };
  for (const body of [
    { ...signup, role: 'admin' },
    { ...signup, acceptedTerms: false },
    { ...signup, confirmPassword: 'different' },
  ])
    assert.equal((await handleSignup(req(body))).status, 400);
  assert.equal((await handleSignup(req(signup, 'https://attacker.example'))).status, 403);
  assert.equal(calls, 0);
});

test('verified code is exchanged server-side and backend provisions fixed technician role', async (t) => {
  setup(t);
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return String(url).endsWith('/verify')
      ? Response.json(providerResponse)
      : new Response(null, { status: 204 });
  };
  const response = await handleSignupVerification(req(verify), 'technician');
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.ok(
    !body.includes('synthetic-access') &&
      !body.includes('synthetic-refresh') &&
      !body.includes('123456'),
  );
  assert.equal(JSON.parse(body).profileReady, true);
  assert.equal(calls[2].url, 'https://api.mock.invalid/api/v1/auth/provision/technician');
  assert.equal(new Headers(calls[2].init.headers).get('authorization'), 'Bearer synthetic-access');
  assert.deepEqual(JSON.parse(calls[2].init.body), { display_name: 'Test Person' });
  assert.ok(
    response.headers.getSetCookie().every((c) => c.includes('HttpOnly') && c.includes('Secure')),
  );
});

test('backend provisioning outage preserves verified session for idempotent retry', async (t) => {
  setup(t);
  globalThis.fetch = async (url) =>
    String(url).endsWith('/verify')
      ? Response.json(providerResponse)
      : String(url).includes('/provision/')
        ? new Response(null, { status: 503 })
        : new Response(null, { status: 204 });
  const response = await handleSignupVerification(req(verify), 'customer');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).profileReady, false);
  assert.equal(response.headers.getSetCookie().length, 2);
});

test('invalid, expired or mismatched provider identity cannot provision or issue cookies', async (t) => {
  setup(t);
  let mode = 0;
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls++;
    if (String(url).endsWith('/attempt')) return new Response(null, { status: 204 });
    if (mode === 0) return new Response(null, { status: 403 });
    return Response.json({
      ...providerResponse,
      user: { ...providerResponse.user, email: 'another@example.test' },
    });
  };
  for (mode = 0; mode < 2; mode++) {
    const result = await handleSignupVerification(req(verify), 'customer');
    assert.equal(result.status, 400);
    assert.equal(result.headers.getSetCookie().length, 0);
  }
  assert.equal(calls, 4);
});

test('resend uses shared fail-closed rate gate', async (t) => {
  setup(t);
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(null, { status: 429, headers: { 'retry-after': '17' } });
  };
  const result = await handleSignupResend(req({ email: 'test@example.test' }));
  assert.equal(result.status, 429);
  assert.equal(result.headers.get('retry-after'), '17');
  assert.equal(calls, 1);
});
