import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const isProd = process.env.NODE_ENV === 'production';

// Content-Security-Policy is NOT set here. It is built per request in src/middleware.ts,
// because production scripts need a per-request nonce — a static `script-src 'self'`
// blocks Next's inline hydration payload and the app renders blank.
//
// /api/* is not rewritten here either. Rewrites are frozen into the build, and the API's
// address must stay a runtime setting (API_URL) so one build runs in any environment —
// the forwarding lives in src/app/api/[...path]/route.ts instead.

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // A self-contained server bundle (.next/standalone) for container images. Opt-in, because
  // `next start` — how the app runs locally and on a plain server — refuses to serve it.
  ...(process.env.NEXT_OUTPUT_STANDALONE === '1' ? { output: 'standalone' as const } : {}),
  // Trace files from the monorepo root so the standalone bundle includes @darp/shared.
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  // The shared package ships TypeScript source; Next compiles it with the app.
  transpilePackages: ['@darp/shared'],
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
    ];
  },
};

export default nextConfig;
