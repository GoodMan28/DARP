import pg from 'pg';
import { db, pool } from '@/server/db';

export { db };

/**
 * Empties every data table but keeps the schema and the seeded departments,
 * master lists and cycle.
 *
 * Runs as the database OWNER on purpose: `harden-db.ts` revokes UPDATE, DELETE and
 * TRUNCATE on `audit_log` and `record_transitions` from the application user, so the
 * app itself cannot erase history. Tests must not weaken that — they step around it
 * with the owner account instead.
 */
export async function truncateAll() {
  const url = process.env.DATABASE_URL_OWNER;
  if (!url) throw new Error('DATABASE_URL_OWNER is required to reset the test database');
  const owner = new pg.Pool({ connectionString: url, max: 1 });
  try {
    // audit_log is deliberately absent: its trigger refuses UPDATE, DELETE and
    // TRUNCATE from everyone, owner included. Test rows accumulate there, which is
    // exactly the behaviour the append-only guarantee promises.
    await owner.query(`
      truncate table record_transitions, evidence_files, records,
                     module_declarations, profile_baselines,
                     sessions, password_resets, login_attempts
      restart identity cascade;
    `);
    // Accounts created by the factories, and by the demo seeder if it has run.
    await owner.query(
      `delete from users where email like 't%@bitmesra.ac.in' or email like '%@demo.bitmesra.ac.in';`,
    );
  } finally {
    await owner.end();
  }
}

export async function closeDb() { await pool.end(); }
