import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildContentSecurityPolicy, buildSecurityHeaders } from '../security-headers.mjs';

const asMap = (headers) => new Map(headers.map(({ key, value }) => [key, value]));

describe('buildSecurityHeaders (production)', () => {
  const headers = asMap(buildSecurityHeaders('production'));

  it('sends Strict-Transport-Security only in production', () => {
    assert.equal(headers.get('Strict-Transport-Security'), 'max-age=31536000; includeSubDomains');
  });

  it('locks framing, MIME sniffing, and referrer behavior', () => {
    assert.equal(headers.get('X-Frame-Options'), 'DENY');
    assert.equal(headers.get('X-Content-Type-Options'), 'nosniff');
    assert.equal(headers.get('Referrer-Policy'), 'strict-origin-when-cross-origin');
  });

  it('disallows unused browser capabilities and self-scopes geolocation', () => {
    const policy = headers.get('Permissions-Policy');
    assert.match(policy, /camera=\(\)/);
    assert.match(policy, /microphone=\(\)/);
    assert.match(policy, /payment=\(\)/);
    assert.match(policy, /usb=\(\)/);
    assert.match(policy, /geolocation=\(self\)/);
  });

  it('frames-ancestors none is present in CSP', () => {
    assert.match(headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
  });
});

describe('buildSecurityHeaders (development)', () => {
  const headers = asMap(buildSecurityHeaders('development'));

  it('never sends HSTS outside production', () => {
    assert.equal(headers.get('Strict-Transport-Security'), undefined);
  });

  it('relaxes the CSP for HMR without opening remote origins', () => {
    const csp = headers.get('Content-Security-Policy');
    assert.match(csp, /script-src 'self' 'unsafe-inline' 'unsafe-eval'/);
    assert.match(csp, /connect-src 'self' ws: wss:/);
    assert.doesNotMatch(csp, /https?:\/\//);
  });
});

describe('buildContentSecurityPolicy', () => {
  it('production policy has no remote origins and denies object embedding', () => {
    const csp = buildContentSecurityPolicy('production');
    for (const directive of [
      "default-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ]) {
      assert.ok(csp.includes(directive), `missing: ${directive}`);
    }
    // No scheme-source or host-source anywhere (no 'https:', no '*')
    assert.doesNotMatch(csp, /https?:/);
    assert.doesNotMatch(csp, /\*/);
  });

  it('allows only same-origin XHR/fetch', () => {
    const csp = buildContentSecurityPolicy('production');
    assert.match(csp, /connect-src 'self'(;|$)/);
  });
});

it('configured map tiles allow only the exact MapTiler image origin', () => {
  const csp = buildContentSecurityPolicy('production', true);
  assert.match(csp, /img-src 'self' data: https:\/\/api\.maptiler\.com(?:;|$)/);
  assert.match(csp, /connect-src 'self'(?:;|$)/);
  assert.doesNotMatch(csp, /\*/);
});
