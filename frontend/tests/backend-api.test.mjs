import assert from 'node:assert/strict';
import { test } from 'node:test';

import { proxyBackendRequest } from '../app/api/backend/[...path]/route.ts';
import { getAuthCookieNames } from '../lib/server/auth.ts';

const ENVIRONMENT_KEYS = [
  'NODE_ENV',
  'FIXNEAR_API_BASE_URL',
  'BACKEND_URL',
  'FIXNEAR_ALLOWED_HOSTS',
  'FIXNEAR_TRUST_PROXY_HEADERS',
];
const CSRF = 'c'.repeat(43);

function setEnvironment(t, values = {}) {
  const previous = Object.fromEntries(ENVIRONMENT_KEYS.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    NODE_ENV: 'production',
    FIXNEAR_API_BASE_URL: 'https://api.fixnear.mock',
    BACKEND_URL: '',
    FIXNEAR_ALLOWED_HOSTS: 'fixnear.example',
    FIXNEAR_TRUST_PROXY_HEADERS: 'false',
    ...values,
  });
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

function mockFetch(t, implementation) {
  const previous = globalThis.fetch;
  globalThis.fetch = implementation;
  t.after(() => {
    globalThis.fetch = previous;
  });
}

function cookieHeader(values) {
  return Object.entries(values)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('; ');
}

function apiRequest(path, { method = 'GET', headers = {}, body } = {}) {
  return new Request(`https://fixnear.example/api/backend/v1/${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body }),
  });
}

function routeContext(...path) {
  return { params: Promise.resolve({ path: ['v1', ...path] }) };
}

test('backend BFF returns a generic 503 when its server-only API URL is absent', async (t) => {
  setEnvironment(t, { FIXNEAR_API_BASE_URL: '', BACKEND_URL: '' });
  let fetchCalled = false;
  mockFetch(t, async () => {
    fetchCalled = true;
    throw new Error('No backend should be called when it is not configured.');
  });

  const response = await proxyBackendRequest(apiRequest('services'), routeContext('services'));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    detail: {
      code: 'api_not_configured',
      message: 'The FixNear database API is not configured for this application.',
    },
  });
  assert.equal(fetchCalled, false);
  assert.match(response.headers.get('cache-control'), /no-store/);
});

test('backend BFF accepts a local HTTP API URL in development', async (t) => {
  setEnvironment(t, {
    NODE_ENV: 'development',
    FIXNEAR_API_BASE_URL: 'http://localhost:8001',
  });
  let observedUrl = '';
  mockFetch(t, async (url) => {
    observedUrl = String(url);
    return Response.json({ detail: { message: 'Authentication required.' } }, { status: 401 });
  });

  const response = await proxyBackendRequest(
    apiRequest('customer/bookings'),
    routeContext('customer', 'bookings'),
  );

  assert.equal(response.status, 401);
  assert.equal(observedUrl, 'http://localhost:8001/api/v1/customer/bookings');
  assert.equal((await response.json()).detail.message, 'Authentication required.');
});

test('backend BFF proxies a public catalog read to the configured API without browser tokens', async (t) => {
  setEnvironment(t);
  let observed;
  mockFetch(t, async (url, init) => {
    observed = { url: String(url), init };
    return Response.json([{ slug: 'ac-repair' }]);
  });

  const response = await proxyBackendRequest(
    apiRequest('services?q=not%20cooling', {
      headers: {
        cookie: cookieHeader({ [getAuthCookieNames().csrf]: CSRF }),
        authorization: 'Bearer attacker-supplied-token',
      },
    }),
    routeContext('services'),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), [{ slug: 'ac-repair' }]);
  assert.equal(observed.url, 'https://api.fixnear.mock/api/v1/services?q=not%20cooling');
  assert.equal(observed.init.method, 'GET');
  assert.equal(observed.init.cache, 'no-store');
  assert.equal(new Headers(observed.init.headers).get('authorization'), null);
  assert.equal(response.headers.get('set-cookie'), null);
  assert.match(response.headers.get('cache-control'), /no-store/);
});

test('backend BFF forwards opt-in nearby coordinates in a body, not the URL or access token', async (t) => {
  setEnvironment(t);
  const names = getAuthCookieNames();
  const searchBody = JSON.stringify({
    mode: 'coordinates',
    latitude: 0.123,
    longitude: 0.456,
    radius_km: 25,
  });
  let observed;
  mockFetch(t, async (url, init) => {
    observed = { url: String(url), init };
    return Response.json({ location_mode: 'coordinates' });
  });

  const response = await proxyBackendRequest(
    apiRequest('services/ac-repair/nearby-technicians/search', {
      method: 'POST',
      headers: {
        origin: 'https://fixnear.example',
        'sec-fetch-site': 'same-origin',
        'content-type': 'application/json',
        'x-csrf-token': CSRF,
        cookie: cookieHeader({ [names.csrf]: CSRF }),
        authorization: 'Bearer browser-supplied-token',
      },
      body: searchBody,
    }),
    routeContext('services', 'ac-repair', 'nearby-technicians', 'search'),
  );

  assert.equal(response.status, 200);
  assert.equal(
    observed.url,
    'https://api.fixnear.mock/api/v1/services/ac-repair/nearby-technicians/search',
  );
  assert.equal(observed.init.method, 'POST');
  assert.equal(new URL(observed.url).search, '');
  assert.equal(new Headers(observed.init.headers).get('authorization'), null);
  assert.equal(await new Response(observed.init.body).text(), searchBody);
});

test('backend BFF forwards only the HttpOnly JWT cookie and validates same-origin CSRF for mutations', async (t) => {
  setEnvironment(t);
  const names = getAuthCookieNames();
  const accessToken = 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJ0ZXN0In0.signature';
  const requestBody = JSON.stringify({ display_name: 'Account profile' });
  let observed;
  mockFetch(t, async (url, init) => {
    observed = { url: String(url), init };
    return Response.json({ user_id: 'private-account' });
  });

  const response = await proxyBackendRequest(
    apiRequest('technician/profile', {
      method: 'PATCH',
      headers: {
        origin: 'https://fixnear.example',
        'sec-fetch-site': 'same-origin',
        'content-type': 'application/json',
        'x-csrf-token': CSRF,
        'idempotency-key': '21e06a16-7953-46c4-a157-15d1624582e9',
        cookie: cookieHeader({ [names.access]: accessToken, [names.csrf]: CSRF }),
        authorization: 'Bearer browser-supplied-token',
      },
      body: requestBody,
    }),
    routeContext('technician', 'profile'),
  );

  assert.equal(response.status, 200);
  assert.equal(observed.url, 'https://api.fixnear.mock/api/v1/technician/profile');
  assert.equal(observed.init.method, 'PATCH');
  assert.equal(new Headers(observed.init.headers).get('authorization'), `Bearer ${accessToken}`);
  assert.equal(new Headers(observed.init.headers).get('x-csrf-token'), null);
  assert.equal(
    new Headers(observed.init.headers).get('idempotency-key'),
    '21e06a16-7953-46c4-a157-15d1624582e9',
  );
  assert.equal(await new Response(observed.init.body).text(), requestBody);
});

test('backend BFF forwards a CSRF-protected bodyless soft-delete request', async (t) => {
  setEnvironment(t);
  const names = getAuthCookieNames();
  let observed;
  mockFetch(t, async (url, init) => {
    observed = { url: String(url), init };
    return new Response(null, { status: 204 });
  });

  const response = await proxyBackendRequest(
    apiRequest('admin/service-catalog/services/a-valid-id', {
      method: 'DELETE',
      headers: {
        origin: 'https://fixnear.example',
        'sec-fetch-site': 'same-origin',
        'x-csrf-token': CSRF,
        cookie: cookieHeader({ [names.csrf]: CSRF }),
      },
    }),
    routeContext('admin', 'service-catalog', 'services', 'a-valid-id'),
  );

  assert.equal(response.status, 204);
  assert.equal(
    observed.url,
    'https://api.fixnear.mock/api/v1/admin/service-catalog/services/a-valid-id',
  );
  assert.equal(observed.init.method, 'DELETE');
  assert.equal(observed.init.body, undefined);
  assert.equal(response.headers.get('content-type'), null);
  assert.match(response.headers.get('cache-control'), /no-store/);
});

test('backend BFF rejects missing or cross-origin CSRF before making an upstream request', async (t) => {
  setEnvironment(t);
  const names = getAuthCookieNames();
  let fetchCount = 0;
  mockFetch(t, async () => {
    fetchCount += 1;
    return Response.json({ ok: true });
  });

  const missingCsrf = await proxyBackendRequest(
    apiRequest('technician/profile', {
      method: 'PATCH',
      headers: {
        origin: 'https://fixnear.example',
        'sec-fetch-site': 'same-origin',
        'content-type': 'application/json',
        cookie: cookieHeader({ [names.csrf]: CSRF }),
      },
      body: JSON.stringify({ display_name: 'No token' }),
    }),
    routeContext('technician', 'profile'),
  );
  const crossOrigin = await proxyBackendRequest(
    apiRequest('technician/profile', {
      method: 'PATCH',
      headers: {
        origin: 'https://attacker.example',
        'sec-fetch-site': 'cross-site',
        'content-type': 'application/json',
        'x-csrf-token': CSRF,
        cookie: cookieHeader({ [names.csrf]: CSRF }),
      },
      body: JSON.stringify({ display_name: 'Cross origin' }),
    }),
    routeContext('technician', 'profile'),
  );

  assert.equal(missingCsrf.status, 403);
  assert.equal(crossOrigin.status, 403);
  assert.deepEqual(await missingCsrf.json(), {
    detail: {
      code: 'forbidden',
      message: 'The request could not be verified. Refresh and try again.',
    },
  });
  assert.equal(fetchCount, 0);
});

test('backend BFF rejects non-HTTPS production endpoints, invalid paths, and oversized payloads', async (t) => {
  setEnvironment(t);
  mockFetch(t, async () => {
    throw new Error('Invalid configuration and requests must not reach an upstream.');
  });
  process.env.FIXNEAR_API_BASE_URL = 'http://api.fixnear.mock';
  const insecureUrl = await proxyBackendRequest(apiRequest('services'), routeContext('services'));
  process.env.FIXNEAR_API_BASE_URL = 'https://api.fixnear.mock';
  const traversal = await proxyBackendRequest(apiRequest('services'), routeContext('..'));

  const names = getAuthCookieNames();
  const largeBody = 'x'.repeat(1_000_001);
  const oversized = await proxyBackendRequest(
    apiRequest('technician/profile', {
      method: 'PATCH',
      headers: {
        origin: 'https://fixnear.example',
        'sec-fetch-site': 'same-origin',
        'content-type': 'application/json',
        'x-csrf-token': CSRF,
        cookie: cookieHeader({ [names.csrf]: CSRF }),
      },
      body: JSON.stringify({ data: largeBody }),
    }),
    routeContext('technician', 'profile'),
  );

  assert.equal(insecureUrl.status, 503);
  assert.equal(traversal.status, 400);
  assert.equal(oversized.status, 413);
});
