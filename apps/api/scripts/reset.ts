import { config } from 'dotenv';
config({ path: '.env.local' });
import pg from 'pg';

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('refusing to reset in production');
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_OWNER!, max: 1 });
  await pool.query('drop schema public cascade; create schema public;');
  await pool.end();
  console.error('schema dropped — run db:migrate, db:harden, db:seed');
}
main().catch((e) => { console.error(e); process.exit(1); });
