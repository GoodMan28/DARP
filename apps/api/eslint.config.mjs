import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import security from 'eslint-plugin-security';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'drizzle/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
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
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // Scripts are operator tools: they write to stdout and read known paths.
    files: ['scripts/**/*.ts', 'tests/**/*.ts', 'src/server/db/migrate.ts', 'src/env.ts'],
    rules: {
      'no-console': 'off',
      'security/detect-non-literal-fs-filename': 'off',
    },
  },
);
