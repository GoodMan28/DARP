import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // Integration suites share one database and call truncateAll() in beforeAll,
    // so files must run one at a time or they will wipe each other's fixtures.
    fileParallelism: false,
    setupFiles: ['./tests/helpers/setup.ts'],
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**'],
    coverage: { provider: 'v8', reporter: ['text', 'html'], reportsDirectory: 'coverage' },
    testTimeout: 20000,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // See tests/helpers/server-only.ts for why this alias exists.
      'server-only': fileURLToPath(new URL('./tests/helpers/server-only.ts', import.meta.url)),
    },
  },
});
