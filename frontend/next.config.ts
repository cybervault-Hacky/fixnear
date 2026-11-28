import type { NextConfig } from 'next';

import { parseAllowedHosts } from './host-policy.mjs';
import { buildSecurityHeaders } from './security-headers.mjs';

// Configuration is validated when Next loads for both build and server startup.
parseAllowedHosts(process.env.FIXNEAR_ALLOWED_HOSTS, process.env.NODE_ENV);

const nextConfig: NextConfig = {
  // Allow the Arena preview host and local Playwright origin during development.
  allowedDevOrigins: ['*.e2b.app', '127.0.0.1'],
  // Enforce the response security-header set on every route (see security-headers.mjs
  // for the CSP rationale and the production-only HSTS decision).
  async headers() {
    return [
      {
        source: '/:path*',
        headers: buildSecurityHeaders(
          process.env.NODE_ENV,
          /^[A-Za-z0-9_-]{1,128}$/.test(process.env.NEXT_PUBLIC_MAPTILER_KEY ?? ''),
        ),
      },
    ];
  },
};

export default nextConfig;
