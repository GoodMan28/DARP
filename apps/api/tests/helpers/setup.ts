import { config } from 'dotenv';

config({ path: '.env.local' });

// Tests never call a publisher register: records are created by hand exactly as before.
// Tests that exercise the resolvers stub fetch and clear this themselves.
process.env.LOOKUP_OFFLINE = '1';

// Tests must never run against a database whose name is not clearly a DARP database.
if (!process.env.DATABASE_URL?.includes('darp')) {
  throw new Error('DATABASE_URL is not set to a darp database — refusing to run tests.');
}
