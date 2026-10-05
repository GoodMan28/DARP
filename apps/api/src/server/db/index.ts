import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

// One pool per process. `max` is deliberately small: ~200 users, low concurrency.
const pool = new pg.Pool({
  connectionString: url,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  application_name: 'darp',
  // Statement timeout stops a runaway query from pinning the server.
  statement_timeout: 15_000,
});

pool.on('error', (err) => {
  console.error(JSON.stringify({ t: new Date().toISOString(), level: 'error', msg: 'pg pool error', err: err.message }));
});

export const db = drizzle(pool, { schema });
export { pool };
export type Db = typeof db;
