import { defineConfig } from 'tsup';

/**
 * Bundles the API into dist/index.js for `npm start`. The shared package is TypeScript
 * source, so it is compiled into the bundle; every other dependency stays in
 * node_modules (argon2 is a native module and cannot be bundled).
 */
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: ['@darp/shared'],
});
