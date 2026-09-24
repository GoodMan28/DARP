import type { NextConfig } from 'next';

const isProd = process.env.NODE_ENV === 'production';

// Content-Security-Policy is NOT set here. It is built per request in src/middleware.ts,
// because production scripts need a per-request nonce — a static `script-src 'self'`
// blocks Next's inline hydration payload and the app renders blank.

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['@node-rs/argon2', 'exceljs'],
  experimental: { serverActions: { bodySizeLimit: '6mb' } },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
          ...(isProd
            ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
            : []),
        ],
      },
      {
        // Never let a browser or proxy cache an API response containing personal data.
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, private' },
          { key: 'Pragma', value: 'no-cache' },
        ],
      },
    ];
  },
};

export default nextConfig;
