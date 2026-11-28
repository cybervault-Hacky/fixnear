import assert from 'node:assert/strict';
import { test } from 'node:test';

import { proxyBackendRequest } from '../app/api/backend/[...path]/route.ts';
import { getAuthCookieNames } from '../lib/server/auth.ts';

const ENVIRONMENT_KEYS = [
  'NODE_ENV',
  'FIXNEAR_API_BASE_URL',
  'BACKEND_URL',
  'FIXNEAR_TRUST_PROXY_HEADERS',
  'FIXNEAR_ALLOWED_HOSTS',
];
const CSRF = 'c'.repeat(43);

function setEnvironment(t, values = {}) {
  const previous = Object.fromEntries(ENVIRONMENT_KEYS.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    NODE_ENV: 'production',
    FIXNEAR_API_BASE_URL: 'https://api.fixnear.mock',
    BACKEND_URL: '',
    FIXNEAR_TRUST_PROXY_HEADERS: 'false',
    FIXNEAR_ALLOWED_HOSTS: 'fixnear.example',
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

function getNames() {
  return getAuthCookieNames();
}

function mutationRequest({
  origin,
  url = 'https://fixnear.example/api/backend/v1/customer/profile',
  headers = {},
}) {
  const names = getNames();
  return new Request(url, {
    method: 'PATCH',
    headers: {
      origin,
      'sec-fetch-site': 'same-origin',
      'content-type': 'application/json',
      'x-csrf-token': CSRF,
      cookie: `${names.csrf}=${CSRF}`,
      ...headers,
    },
    body: JSON.stringify({ display_name: 'Origin policy probe' }),
  });
}

const context = { params: Promise.resolve({ path: ['v1', 'customer', 'profile'] }) };

async function attemptMutation(t, options) {
  setEnvironment(t, options.environment ?? {});
  let fetchCount = 0;
  mockFetch(t, async () => {
    fetchCount += 1;
    return Response.json({ ok: true });
  });
  const response = await proxyBackendRequest(mutationRequest(options), context);
  return { response, fetchCount };
}

test('forwarding headers are ignored unless FIXNEAR_TRUST_PROXY_HEADERS=true', async (t) => {
  const { response, fetchCount } = await attemptMutation(t, {
    origin: 'https://fixnear.example',
    headers: {
      'x-forwarded-host': 'attacker.example',
      'x-forwarded-proto': 'https',
    },
  });
  // Derived origin is Host-based (fixnear.example), so the same-origin check passes
  // regardless of the spoofed forwarding headers.
  assert.equal(response.status, 200);
  assert.equal(fetchCount, 1);
});

test('cross-origin requests still fail when forwarding headers are ignored', async (t) => {
  const { response, fetchCount } = await attemptMutation(t, {
    origin: 'https://attacker.example',
    headers: {
      'x-forwarded-host': 'attacker.example',
      'x-forwarded-proto': 'https',
    },
  });
  assert.equal(response.status, 403);
  assert.equal(fetchCount, 0);
});

test('trusted proxy headers are honored when explicitly enabled', async (t) => {
  const { response, fetchCount } = await attemptMutation(t, {
    // Simulate TLS terminated at the proxy: the internal hop is http, the browser
    // origin is https. Only honored because the deployment opted in.
    url: 'http://internal-ingress:3000/api/backend/v1/customer/profile',
    origin: 'https://fixnear.example',
    headers: {
      'x-forwarded-host': 'fixnear.example',
      'x-forwarded-proto': 'https',
    },
    environment: { FIXNEAR_TRUST_PROXY_HEADERS: 'true' },
  });
  assert.equal(response.status, 200);
  assert.equal(fetchCount, 1);
});

test('trusted proxy mode rejects a forwarded proto other than http/https', async (t) => {
  const { response, fetchCount } = await attemptMutation(t, {
    url: 'http://internal-ingress:3000/api/backend/v1/customer/profile',
    origin: 'https://fixnear.example',
    headers: {
      'x-forwarded-host': 'fixnear.example',
      'x-forwarded-proto': 'gopher',
    },
    environment: { FIXNEAR_TRUST_PROXY_HEADERS: 'true' },
  });
  assert.equal(response.status, 403);
  assert.equal(fetchCount, 0);
});

test('allowed-host list pins the effective hostname when configured', async (t) => {
  const blocked = await attemptMutation(t, {
    url: 'https://evil.example/api/backend/v1/customer/profile',
    origin: 'https://evil.example',
    environment: { FIXNEAR_ALLOWED_HOSTS: 'fixnear.example' },
  });
  assert.equal(blocked.response.status, 403);
  assert.equal(blocked.fetchCount, 0);

  const allowed = await attemptMutation(t, {
    url: 'https://fixnear.example:8443/api/backend/v1/customer/profile',
    origin: 'https://fixnear.example:8443',
    environment: { FIXNEAR_ALLOWED_HOSTS: 'fixnear.example:8443' },
  });
  assert.equal(allowed.response.status, 200);
});

test('wildcard allowed-host entries are rejected', async (t) => {
  const sub = await attemptMutation(t, {
    url: 'https://preview-123.e2b.app/api/backend/v1/customer/profile',
    origin: 'https://preview-123.e2b.app',
    environment: { FIXNEAR_ALLOWED_HOSTS: '*.e2b.app' },
  });
  assert.equal(sub.response.status, 403);

  const bare = await attemptMutation(t, {
    url: 'https://e2b.app/api/backend/v1/customer/profile',
    origin: 'https://e2b.app',
    environment: { FIXNEAR_ALLOWED_HOSTS: '*.e2b.app' },
  });
  assert.equal(bare.response.status, 403);

  const other = await attemptMutation(t, {
    url: 'https://fixnear.example/api/backend/v1/customer/profile',
    origin: 'https://fixnear.example',
    environment: { FIXNEAR_ALLOWED_HOSTS: '*.e2b.app' },
  });
  assert.equal(other.response.status, 403);
});

test('userinfo and out-of-range ports in forwarding headers fail closed', async (t) => {
  for (const badHost of [
    'fixnear.example@evil.example',
    'fixnear.example:99999',
    'fixnear..example',
    'fixnear.example:1:2',
  ]) {
    const attempt = await attemptMutation(t, {
      url: 'http://internal-ingress:3000/api/backend/v1/customer/profile',
      origin: 'https://fixnear.example',
      headers: {
        'x-forwarded-host': badHost,
        'x-forwarded-proto': 'https',
      },
      environment: { FIXNEAR_TRUST_PROXY_HEADERS: 'true' },
    });
    assert.equal(attempt.response.status, 403, `expected 403 for ${badHost}`);
    assert.equal(attempt.fetchCount, 0);
  }
});

test('a URL with an empty hostname label fails closed', async (t) => {
  // WHATWG URL parsing tolerates empty labels; the BFF must not.
  const attempt = await attemptMutation(t, {
    url: 'https://fixnear..example/api/backend/v1/customer/profile',
    origin: 'https://fixnear..example',
  });
  assert.equal(attempt.response.status, 403);
  assert.equal(attempt.fetchCount, 0);
});

test('non-ASCII hosts in forwarding headers fail the LDH check', async (t) => {
  // Browsers punycode-encode Unicode hosts, but a raw non-ASCII header value must be
  // rejected rather than compared or normalized silently.
  const attempt = await attemptMutation(t, {
    url: 'http://internal-ingress:3000/api/backend/v1/customer/profile',
    origin: 'https://fixnear.example',
    headers: {
      // Node decodes raw header bytes as Latin-1; these stand in for raw UTF-8.
      'x-forwarded-host': 'f\u00ee xnear.example'.replace(' ', ''),
      'x-forwarded-proto': 'https',
    },
    environment: { FIXNEAR_TRUST_PROXY_HEADERS: 'true' },
  });
  assert.equal(attempt.response.status, 403);
  assert.equal(attempt.fetchCount, 0);
});

test('multi-valued forwarding headers are rejected', async (t) => {
  const { response, fetchCount } = await attemptMutation(t, {
    url: 'http://internal-ingress:3000/api/backend/v1/customer/profile',
    origin: 'https://fixnear.example',
    headers: {
      'x-forwarded-host': 'fixnear.example, internal-hop.cluster.local',
      'x-forwarded-proto': 'https, http',
    },
    environment: { FIXNEAR_TRUST_PROXY_HEADERS: 'true' },
  });
  assert.equal(response.status, 403);
  assert.equal(fetchCount, 0);
});

test('allowed-host matching rejects mismatched ports', async (t) => {
  const { response } = await attemptMutation(t, {
    url: 'https://fixnear.example:8443/api/backend/v1/customer/profile',
    origin: 'https://fixnear.example:8443',
    environment: { FIXNEAR_ALLOWED_HOSTS: 'fixnear.example:9999' },
  });
  assert.equal(response.status, 403);
});

test('a malformed nonempty allowlist fails closed', async (t) => {
  const { response, fetchCount } = await attemptMutation(t, {
    origin: 'https://fixnear.example',
    environment: { FIXNEAR_ALLOWED_HOSTS: 'bad host' },
  });
  assert.equal(response.status, 403);
  assert.equal(fetchCount, 0);
});
