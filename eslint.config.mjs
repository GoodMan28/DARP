import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';
import security from 'eslint-plugin-security';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

export default [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'drizzle/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    plugins: { security },
    rules: {
      // Read by key constantly (`data[field.key]`); unknown keys are rejected by validateRecord.
      'security/detect-object-injection': 'off',
      'security/detect-non-literal-fs-filename': 'error',
      'security/detect-child-process': 'error',
      'security/detect-eval-with-expression': 'error',
      'no-console': ['error', { allow: ['error'] }],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      'react/no-danger': 'error',
    },
  },
  {
    // Scripts are operator tools: they write to stdout and read known paths.
    files: ['scripts/**/*.ts', 'tests/**/*.ts', 'src/server/db/migrate.ts'],
    rules: {
      'no-console': 'off',
      'security/detect-non-literal-fs-filename': 'off',
    },
  },
];
