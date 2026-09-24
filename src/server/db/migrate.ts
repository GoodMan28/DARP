import { config } from 'dotenv';
config({ path: '.env.local' });

import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

async function main() {
  const url = process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL_OWNER is not set');
  const pool = new pg.Pool({ connectionString: url, max: 1 });

  // Extensions must exist before the generated migrations create their indexes.
  await pool.query('create extension if not exists "pgcrypto";'); // gen_random_uuid()
  await pool.query('create extension if not exists "pg_trgm";'); // search index

  await migrate(drizzle(pool), { migrationsFolder: './drizzle' });
  await pool.end();
  console.error('migrations applied');
}

main().catch((e) => { console.error(e); process.exit(1); });
