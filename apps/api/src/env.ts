import { existsSync } from 'node:fs';

/*
 * Loads `.env.local` for local development. Imported first by index.ts, so the variables
 * exist before any module that reads them at load time (the database pool does).
 * Variables already set in the real environment win over the file, which is how a
 * deployment platform's settings override it in production.
 */
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
