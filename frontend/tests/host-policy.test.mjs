import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getEffectiveOrigin, parseAllowedHosts } from '../host-policy.mjs';

test('production startup rejects missing, wildcard and malformed configuration', () => {
  for (const value of ['', undefined, '*.example.com', 'example.com,', 'bad host', 'a@b']) {
    assert.throws(() => parseAllowedHosts(value, 'production'));
  }
  assert.equal(parseAllowedHosts('', 'development'), null);
});

test('exact host and port matching is normalized and enforced', () => {
  const env = {
    NODE_ENV: 'production',
    FIXNEAR_ALLOWED_HOSTS: 'FIXNEAR.example, fixnear.example:8443',
  };
  const request = (host) => new Request('https://internal/', { headers: { host } });
  assert.equal(getEffectiveOrigin(request('FIXNEAR.example:443'), env), 'https://fixnear.example');
  assert.equal(
    getEffectiveOrigin(request('fixnear.example:8443'), env),
    'https://fixnear.example:8443',
  );
  assert.equal(getEffectiveOrigin(request('fixnear.example:444'), env), null);
  assert.equal(getEffectiveOrigin(request('evil.fixnear.example'), env), null);
});

test('forwarded origin requires opt-in and rejects appended header values', () => {
  const req = new Request('http://internal/', {
    headers: {
      host: 'internal',
      'x-forwarded-host': 'fixnear.example',
      'x-forwarded-proto': 'https',
    },
  });
  const env = { NODE_ENV: 'production', FIXNEAR_ALLOWED_HOSTS: 'fixnear.example' };
  assert.equal(getEffectiveOrigin(req, env), null);
  assert.equal(
    getEffectiveOrigin(req, { ...env, FIXNEAR_TRUST_PROXY_HEADERS: 'true' }),
    'https://fixnear.example',
  );
  const appended = new Request('http://internal/', {
    headers: { 'x-forwarded-host': 'evil.example, fixnear.example', 'x-forwarded-proto': 'https' },
  });
  assert.equal(getEffectiveOrigin(appended, { ...env, FIXNEAR_TRUST_PROXY_HEADERS: 'true' }), null);
});
