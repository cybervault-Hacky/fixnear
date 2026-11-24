import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getAuthCookieNames, handleLogout, handleSession } from '../lib/server/auth.ts';

const ENVIRONMENT_KEYS = ['NODE_ENV', 'FRONTEND_URL', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'];

function setTestEnvironment(t) {
  const previous = Object.fromEntries(ENVIRONMENT_KEYS.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    NODE_ENV: 'production',
    FRONTEND_URL: 'https://fixnear.example',
    SUPABASE_URL: 'https://supabase.mock.invalid',
    SUPABASE_ANON_KEY: 'synthetic-anon-key',
  });
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

function mockFetch(t, implementation) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = implementation;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
}

function cookieHeader(values) {
  return Object.entries(values)
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join('; ');
}

function requestWithCookies(path, cookies, headers = {}) {
  return new Request(`https://fixnear.example${path}`, {
    method: path.endsWith('/logout') ? 'POST' : 'GET',
    headers: {
      ...(Object.keys(cookies).length > 0 ? { cookie: cookieHeader(cookies) } : {}),
      ...headers,
    },
  });
}

function readSetCookies(response) {
  return response.headers.getSetCookie().map((serialized) => {
    const [cookiePair, ...attributes] = serialized.split(';').map((part) => part.trim());
    const separator = cookiePair.indexOf('=');
    return {
      name: cookiePair.slice(0, separator),
      value: decodeURIComponent(cookiePair.slice(separator + 1)),
      attributes: new Map(
        attributes.map((attribute) => {
          const attributeSeparator = attribute.indexOf('=');
          if (attributeSeparator === -1) return [attribute.toLowerCase(), true];
          return [
            attribute.slice(0, attributeSeparator).toLowerCase(),
            attribute.slice(attributeSeparator + 1),
          ];
        }),
      ),
    };
  });
}

function assertSecureHostCookie(cookie, { maxAge, sameSite = 'Strict' } = {}) {
  assert.match(cookie.name, /^__Host-fixnear-/);
  assert.equal(cookie.attributes.get('path'), '/');
  assert.equal(cookie.attributes.get('httponly'), true);
  assert.equal(cookie.attributes.get('secure'), true);
  assert.equal(cookie.attributes.get('samesite'), sameSite);
  assert.equal(cookie.attributes.has('domain'), false);
  if (maxAge !== undefined) assert.equal(cookie.attributes.get('max-age'), String(maxAge));
}

const CSRF = 'c'.repeat(43);
const PATH_SESSION = '/api/auth/session';
const PATH_LOGOUT = '/api/auth/logout';

test('session endpoint returns an anonymous, non-cacheable session and a CSRF token', async (t) => {
  setTestEnvironment(t);
  let fetchCalled = false;
  mockFetch(t, async () => {
    fetchCalled = true;
    throw new Error('No upstream request is expected without an auth cookie.');
  });

  const response = await handleSession(new Request(`https://fixnear.example${PATH_SESSION}`));
  const payload = await response.json();
  const cookies = readSetCookies(response);

  assert.equal(fetchCalled, false);
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(payload).sort(), ['csrfToken', 'user']);
  assert.equal(payload.user, null);
  assert.match(payload.csrfToken, /^[A-Za-z0-9_-]{43}$/);
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.equal(cookies.length, 1);
  assert.equal(cookies[0].name, getAuthCookieNames().csrf);
  assert.equal(cookies[0].value, payload.csrfToken);
  assertSecureHostCookie(cookies[0], { sameSite: 'Strict' });
});

test('valid session returns only allowlisted user fields and never returns bearer tokens', async (t) => {
  setTestEnvironment(t);
  const names = getAuthCookieNames();
  const accessToken = 'synthetic-access-token-not-for-browser-json';
  const refreshToken = 'synthetic-refresh-token-not-for-browser-json';
  let requestCount = 0;
  mockFetch(t, async (url, init) => {
    requestCount += 1;
    assert.equal(String(url), 'https://supabase.mock.invalid/auth/v1/user');
    assert.equal(init.method, 'GET');
    assert.equal(new Headers(init.headers).get('authorization'), `Bearer ${accessToken}`);
    assert.equal(new Headers(init.headers).get('apikey'), 'synthetic-anon-key');
    assert.equal(init.credentials, 'omit');
    assert.equal(init.cache, 'no-store');
    assert.equal(init.redirect, 'error');
    return Response.json({
      id: 'synthetic-user-id',
      email: 'person@example.test',
      app_metadata: { role: 'admin' },
      user_metadata: { refresh_token: 'should-not-be-returned' },
      access_token: accessToken,
    });
  });

  const response = await handleSession(
    requestWithCookies(PATH_SESSION, {
      [names.access]: accessToken,
      [names.refresh]: refreshToken,
      [names.csrf]: CSRF,
    }),
  );
  const payload = await response.json();

  assert.equal(requestCount, 1);
  assert.equal(response.status, 200);
  assert.deepEqual(payload.user, {
    id: 'synthetic-user-id',
    email: 'person@example.test',
  });
  assert.equal(payload.csrfToken, CSRF);
  assert.equal(JSON.stringify(payload).includes(accessToken), false);
  assert.equal(JSON.stringify(payload).includes(refreshToken), false);
  assert.equal(JSON.stringify(payload).includes('should-not-be-returned'), false);
  assert.deepEqual(readSetCookies(response), []);
});

test('expired access token refreshes server-side and rotates secure HttpOnly cookies', async (t) => {
  setTestEnvironment(t);
  const names = getAuthCookieNames();
  const oldAccessToken = 'synthetic-expired-access-token';
  const oldRefreshToken = 'synthetic-old-refresh-token';
  const newAccessToken = 'synthetic-new-access-token';
  const newRefreshToken = 'synthetic-rotated-refresh-token';
  const seenRequests = [];
  mockFetch(t, async (url, init) => {
    seenRequests.push({ url: String(url), init });
    if (String(url).endsWith('/user')) {
      return Response.json({ message: 'expired' }, { status: 401 });
    }
    return Response.json({
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
      expires_in: 1800,
      user: { id: 'refreshed-user', email: 'refresh@example.test', role: 'admin' },
    });
  });

  const response = await handleSession(
    requestWithCookies(PATH_SESSION, {
      [names.access]: oldAccessToken,
      [names.refresh]: oldRefreshToken,
      [names.csrf]: CSRF,
    }),
  );
  const payload = await response.json();
  const cookies = readSetCookies(response);
  const cookieByName = new Map(cookies.map((cookie) => [cookie.name, cookie]));

  assert.equal(response.status, 200);
  assert.equal(seenRequests.length, 2);
  assert.equal(seenRequests[0].url, 'https://supabase.mock.invalid/auth/v1/user');
  assert.equal(
    seenRequests[1].url,
    'https://supabase.mock.invalid/auth/v1/token?grant_type=refresh_token',
  );
  assert.equal(seenRequests[1].init.method, 'POST');
  assert.deepEqual(JSON.parse(seenRequests[1].init.body), {
    refresh_token: oldRefreshToken,
  });
  assert.deepEqual(payload.user, {
    id: 'refreshed-user',
    email: 'refresh@example.test',
  });
  assert.equal(JSON.stringify(payload).includes(newAccessToken), false);
  assert.equal(JSON.stringify(payload).includes(newRefreshToken), false);
  assertSecureHostCookie(cookieByName.get(names.access), { maxAge: 1800 });
  assertSecureHostCookie(cookieByName.get(names.refresh), { maxAge: 2592000 });
  assert.equal(cookieByName.get(names.access).value, newAccessToken);
  assert.equal(cookieByName.get(names.refresh).value, newRefreshToken);
});

test('invalid refresh clears auth cookies without exposing provider errors or tokens', async (t) => {
  setTestEnvironment(t);
  const names = getAuthCookieNames();
  const accessToken = 'expired-access-secret';
  const refreshToken = 'invalid-refresh-secret';
  mockFetch(t, async (url) => {
    if (String(url).endsWith('/user')) return new Response(null, { status: 401 });
    return Response.json(
      { error: 'invalid_grant', detail: 'provider-error-secret' },
      { status: 401 },
    );
  });

  const response = await handleSession(
    requestWithCookies(PATH_SESSION, {
      [names.access]: accessToken,
      [names.refresh]: refreshToken,
      [names.csrf]: CSRF,
    }),
  );
  const payload = await response.json();
  const cookies = readSetCookies(response);
  const clearedNames = new Set(cookies.map((cookie) => cookie.name));

  assert.equal(response.status, 200);
  assert.deepEqual(payload.user, null);
  assert.equal(JSON.stringify(payload).includes(accessToken), false);
  assert.equal(JSON.stringify(payload).includes(refreshToken), false);
  assert.equal(JSON.stringify(payload).includes('provider-error-secret'), false);
  assert.ok(clearedNames.has(names.access));
  assert.ok(clearedNames.has(names.refresh));
  assert.ok(cookies.every((cookie) => cookie.attributes.get('max-age') === '0'));
});

test('refresh network failure is generic and does not discard a potentially valid session', async (t) => {
  setTestEnvironment(t);
  const names = getAuthCookieNames();
  const accessToken = 'expired-access-marker';
  const refreshToken = 'refresh-marker';
  mockFetch(t, async (url) => {
    if (String(url).endsWith('/user')) return new Response(null, { status: 401 });
    throw new Error(`network failure containing ${refreshToken}`);
  });

  const response = await handleSession(
    requestWithCookies(PATH_SESSION, {
      [names.access]: accessToken,
      [names.refresh]: refreshToken,
      [names.csrf]: CSRF,
    }),
  );
  const payload = await response.json();

  assert.equal(response.status, 503);
  assert.deepEqual(payload, {
    user: null,
    csrfToken: CSRF,
    error: 'authentication_unavailable',
  });
  assert.equal(JSON.stringify(payload).includes(accessToken), false);
  assert.equal(JSON.stringify(payload).includes(refreshToken), false);
  assert.deepEqual(readSetCookies(response), []);
});

test('logout checks Origin and CSRF, calls provider without returning credentials, and clears cookies', async (t) => {
  setTestEnvironment(t);
  const names = getAuthCookieNames();
  const accessToken = 'logout-access-token';
  let observedRequest;
  mockFetch(t, async (url, init) => {
    observedRequest = { url: String(url), init };
    return new Response(null, { status: 204 });
  });

  const response = await handleLogout(
    requestWithCookies(
      PATH_LOGOUT,
      {
        [names.access]: accessToken,
        [names.refresh]: 'logout-refresh-token',
        [names.csrf]: CSRF,
      },
      {
        origin: 'https://fixnear.example',
        'sec-fetch-site': 'same-origin',
        'x-csrf-token': CSRF,
      },
    ),
  );
  const cookies = readSetCookies(response);
  const clearedNames = new Set(cookies.map((cookie) => cookie.name));

  assert.equal(response.status, 204);
  assert.equal(await response.text(), '');
  assert.equal(observedRequest.url, 'https://supabase.mock.invalid/auth/v1/logout');
  assert.equal(observedRequest.init.method, 'POST');
  assert.equal(
    new Headers(observedRequest.init.headers).get('authorization'),
    `Bearer ${accessToken}`,
  );
  assert.ok(clearedNames.has(names.access));
  assert.ok(clearedNames.has(names.refresh));
  assert.ok(clearedNames.has(names.csrf));
  assert.ok(cookies.every((cookie) => cookie.attributes.get('max-age') === '0'));
  for (const cookie of cookies) assertSecureHostCookie(cookie, { maxAge: 0 });
  assert.equal(
    cookies.some((cookie) => cookie.value === accessToken),
    false,
  );
});

test('logout rejects cross-origin or missing-CSRF requests before contacting Supabase', async (t) => {
  setTestEnvironment(t);
  const names = getAuthCookieNames();
  let fetchCount = 0;
  mockFetch(t, async () => {
    fetchCount += 1;
    return new Response(null, { status: 204 });
  });

  const forgedOrigin = await handleLogout(
    requestWithCookies(
      PATH_LOGOUT,
      { [names.access]: 'access-token', [names.csrf]: CSRF },
      {
        origin: 'https://attacker.example',
        'sec-fetch-site': 'cross-site',
        'x-csrf-token': CSRF,
      },
    ),
  );
  const forgedCsrf = await handleLogout(
    requestWithCookies(
      PATH_LOGOUT,
      { [names.access]: 'access-token', [names.csrf]: CSRF },
      { origin: 'https://fixnear.example', 'x-csrf-token': 'x'.repeat(43) },
    ),
  );

  assert.equal(forgedOrigin.status, 403);
  assert.deepEqual(await forgedOrigin.json(), { error: 'forbidden' });
  assert.equal(forgedCsrf.status, 403);
  assert.deepEqual(await forgedCsrf.json(), { error: 'forbidden' });
  assert.equal(fetchCount, 0);
  assert.deepEqual(readSetCookies(forgedOrigin), []);
  assert.deepEqual(readSetCookies(forgedCsrf), []);
});
