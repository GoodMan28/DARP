// Test stub for the `server-only` package.
//
// `server-only`'s published entry throws unless the bundler applies the
// "react-server" export condition, which vitest does not. Every file under
// src/server/** imports it as a build-time guard, so the suite aliases the
// package to this empty module instead of weakening the guard in the source.
export {};
