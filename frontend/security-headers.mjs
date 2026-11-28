/**
 * Response security headers for the FixNear Next.js app.
 *
 * Content-Security-Policy rationale
 * --------------------------------
 * FixNear serves its own HTML with no third-party scripts, no external images,
 * no remote fonts (the Geist family is bundled), and no direct browser-to-Supabase
 * traffic — all authenticated API access flows through the same-origin Next.js BFF.
 *
 *   default-src 'self'      deny anything not listed explicitly
 *   script-src 'unsafe-inline'
 *                           REQUIRED by the App Router: Next.js hydrates pages with
 *                           inline serialized flight payloads (`self.__next_f.push`)
 *                           and inline bootstrap scripts. A nonce-based policy is the
 *                           correct long-term fix but needs middleware-generated nonces
 *                           wired through every layout/route and full browser
 *                           verification; until that lands we keep 'unsafe-inline'
 *                           and lean on React's output encoding + the other directives.
 *                           No remote script origins are allowed.
 *   style-src 'unsafe-inline'
 *                           React inline `style` attributes are used by dynamic
 *                           components (motion, measured widths). No remote styles.
 *   img-src 'self' data:    optionally permits only api.maptiler.com for configured map tiles;
 *                           tiles load only after an explicit user gesture.
 *   font-src 'self'         bundled Geist fonts only
 *   connect-src 'self'      browser talks only to the same-origin BFF; the BFF calls
 *                           the API server-side (browser never sees the API origin)
 *   object-src 'none'       no plugins
 *   base-uri 'none'         blocks <base> tag injection
 *   form-action 'self'      forms may only post to this origin
 *   frame-ancestors 'none'  equivalent to X-Frame-Options DENY (middleware also sets it
 *                           for legacy agents)
 *
 * Development builds relax script-src with 'unsafe-eval' (webpack HMR) and allow
 * WebSocket connections for the dev server; production sends the strict list.
 *
 * Strict-Transport-Security is production-only: emitting it on localhost HTTP would
 * poison browser caches for local development.
 */

const isProductionEnv = (env) => env === 'production';

export function buildContentSecurityPolicy(env, mapTilesEnabled = false) {
  const isProduction = isProductionEnv(env);
  const directives = [
    "default-src 'self'",
    isProduction
      ? "script-src 'self' 'unsafe-inline'"
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    mapTilesEnabled ? "img-src 'self' data: https://api.maptiler.com" : "img-src 'self' data:",
    "font-src 'self'",
    isProduction ? "connect-src 'self'" : "connect-src 'self' ws: wss:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  return directives.join('; ');
}

/**
 * Build the fixed security-header set for a deployment environment.
 * @param {string | undefined} env - value of process.env.NODE_ENV
 * @returns {{key: string, value: string}[]}
 */
export function buildSecurityHeaders(env, mapTilesEnabled = false) {
  const headers = [
    { key: 'Content-Security-Policy', value: buildContentSecurityPolicy(env, mapTilesEnabled) },
    // Legacy fallback for browsers without CSP frame-ancestors support.
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    // geolocation=(self): the customer discovery flow uses the browser Geolocation API.
    // camera/microphone/payment/usb are unused anywhere in the product.
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(self), payment=(), usb=()',
    },
  ];
  if (isProductionEnv(env)) {
    headers.push({
      key: 'Strict-Transport-Security',
      value: 'max-age=31536000; includeSubDomains',
    });
  }
  return headers;
}

export default buildSecurityHeaders;
