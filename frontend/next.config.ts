import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Allow the Arena preview host and local Playwright origin during development.
  allowedDevOrigins: ['*.e2b.app', '127.0.0.1'],
};

export default nextConfig;
