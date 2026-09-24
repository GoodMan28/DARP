import { config } from 'dotenv';
config({ path: '.env.local' });
import pg from 'pg';

const APP_USER = 'darp_app';
const APP_PASSWORD = process.env.APP_DB_PASSWORD ?? 'devapppassword';

if (!/^[a-zA-Z0-9_!@#$%^&*()\-=+.:;,?~[\]{}|]+$/.test(APP_PASSWORD)) {
  throw new Error('APP_DB_PASSWORD contains characters that cannot be embedded safely');
}

const statements: string[] = [
  // ── 1. Least-privilege application user ───────────────────────────────
  `do $$ begin
     if not exists (select 1 from pg_roles where rolname = '${APP_USER}') then
       execute format('create role ${APP_USER} login password %L', '${APP_PASSWORD}');
     else
       execute format('alter role ${APP_USER} login password %L', '${APP_PASSWORD}');
     end if;
   end $$;`,
  `revoke all on schema public from ${APP_USER};`,
  `grant usage on schema public to ${APP_USER};`,
  `grant select, insert, update, delete on all tables in schema public to ${APP_USER};`,
  `grant usage, select on all sequences in schema public to ${APP_USER};`,
  // No DDL, ever: the app user must not be able to drop or alter anything.
  `revoke create on schema public from ${APP_USER};`,
  `alter default privileges in schema public grant select, insert, update, delete on tables to ${APP_USER};`,
  `alter default privileges in schema public grant usage, select on sequences to ${APP_USER};`,

  // ── 2. Append-only audit log ──────────────────────────────────────────
  `revoke update, delete, truncate on audit_log from ${APP_USER};`,
  `create or replace function audit_log_is_append_only() returns trigger as $$
     begin
       raise exception 'audit_log is append-only (attempted %)', tg_op;
     end $$ language plpgsql;`,
  `drop trigger if exists audit_log_no_update on audit_log;`,
  `create trigger audit_log_no_update before update or delete or truncate on audit_log
     for each statement execute function audit_log_is_append_only();`,

  // ── 3. Transition history is append-only too ──────────────────────────
  `revoke update, delete on record_transitions from ${APP_USER};`,

  // ── 4. updated_at is maintained by the database, not trusted from the app
  `create or replace function set_updated_at() returns trigger as $$
     begin new.updated_at = now(); return new; end $$ language plpgsql;`,
  `drop trigger if exists records_set_updated_at on records;`,
  `create trigger records_set_updated_at before update on records
     for each row execute function set_updated_at();`,
  `drop trigger if exists users_set_updated_at on users;`,
  `create trigger users_set_updated_at before update on users
     for each row execute function set_updated_at();`,

  // ── 5. A record may not be approved without having been verified ──────
  `alter table records drop constraint if exists records_approval_order;`,
  `alter table records add constraint records_approval_order
     check (approved_at is null or verified_at is not null);`,

  // ── 6. Evidence field keys are identifiers, never paths ───────────────
  `alter table evidence_files drop constraint if exists evidence_field_key_format;`,
  `alter table evidence_files add constraint evidence_field_key_format
     check (field_key ~ '^[a-zA-Z][a-zA-Z0-9_]{0,63}$');`,

  // ── 7. Connection hygiene ─────────────────────────────────────────────
  `alter role ${APP_USER} set statement_timeout = '15s';`,
  `alter role ${APP_USER} set idle_in_transaction_session_timeout = '30s';`,
];

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_OWNER!, max: 1 });
  for (const s of statements) {
    await pool.query(s);
  }
  await pool.end();
  console.error(`hardening applied (${statements.length} statements)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
