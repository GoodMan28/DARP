/*
 * Runs the browser tests on a private copy of the site that uses the TEST database (darp_test), so a
 * test may sign in, type, upload and save without touching the real data in `darp` or the site that is
 * running. The copy lives on ports 3100 (web) and 4100 (API) and is switched off again afterwards.
 *
 *   node scripts/e2e-copy.mjs                      build the copy, reseed the demo accounts, run every test
 *   node scripts/e2e-copy.mjs tests/e2e/x.spec.ts  run only some tests (any Playwright arguments)
 *   node scripts/e2e-copy.mjs --no-build           reuse the last build of the copy
 *   node scripts/e2e-copy.mjs --no-seed            keep the data as it is
 *
 * Run the API tests (vitest) first: they empty the test database. This script then puts the demo accounts back.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const web = join(root, 'apps', 'web');
const api = join(root, 'apps', 'api');
const WEB_PORT = 3100;
const API_PORT = 4100;

const args = process.argv.slice(2);
const flag = (f) => { const i = args.indexOf(f); if (i >= 0) args.splice(i, 1); return i >= 0; };
const skipBuild = flag('--no-build');
const skipSeed = flag('--no-seed');

/* ── the test database, and a check that it is the test database ── */
const env = Object.fromEntries(readFileSync(join(api, '.env.local'), 'utf8').split(/\r?\n/)
  .filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; }));
const toTest = (url) => url.replace(/\/darp$/, '/darp_test');
const DATABASE_URL = toTest(env.DATABASE_URL ?? '');
const DATABASE_URL_OWNER = toTest(env.DATABASE_URL_OWNER ?? '');
if (!DATABASE_URL.endsWith('/darp_test') || !DATABASE_URL_OWNER.endsWith('/darp_test')) {
  console.error('Refusing to run: the database address does not end in /darp_test.');
  process.exit(1);
}

const copy = {
  ...process.env,
  DATABASE_URL, DATABASE_URL_OWNER,
  PORT: String(API_PORT), HOST: '127.0.0.1', APP_URL: `http://localhost:${WEB_PORT}`,
  EVIDENCE_DIR: './storage/evidence-test',
  LOOKUP_OFFLINE: '1',            // nothing is sent to Crossref, Elsevier, ORCID or the like
  NEXT_DIST_DIR: '.next-test',    // the copy's own build, so the running site's is left alone
  API_URL: `http://127.0.0.1:${API_PORT}`,
};

const run = (cmd, cmdArgs, cwd, extra = {}) =>
  spawnSync(cmd, cmdArgs, { cwd, env: { ...copy, ...extra }, stdio: 'inherit', shell: true });

/**
 * The institute directory (AISHE and ROR, some 200,000 rows) is reference data the forms need; the API tests
 * empty it. When the test database has none, it is copied from `darp`, which is only READ here (the
 * connection is read-only) and never written.
 */
async function copyInstitutions() {
  const pg = createRequire(join(api, 'package.json'))('pg');
  const dst = new pg.Pool({ connectionString: DATABASE_URL_OWNER, max: 1 });
  const src = new pg.Pool({ connectionString: env.DATABASE_URL, max: 1, options: '-c default_transaction_read_only=on' });
  try {
    const count = async (pool) => (await pool.query('select count(*)::int as n from institutions')).rows[0].n;
    const [have, want] = [await count(dst), await count(src)];
    if (have === want) return;                                   // already a full copy
    await dst.query('delete from institutions');                  // darp_test only (checked at the top)
    const { rows } = await src.query('select row_to_json(i) as r from institutions i');
    console.log(`copying ${rows.length} institutes from darp (read only) to darp_test`);
    for (let i = 0; i < rows.length; i += 4000) {
      // `added_by` names a user of the real site; the test database has other users.
      const batch = rows.slice(i, i + 4000).map((x) => ({ ...x.r, added_by: null }));
      await dst.query('insert into institutions select * from json_populate_recordset(null::institutions, $1::json)', [JSON.stringify(batch)]);
    }
  } finally { await Promise.all([src.end(), dst.end()]); }
}

if (!skipBuild) {
  console.log('\n== building the copy of the site ==');
  if (run('npx', ['next', 'build'], web).status !== 0) process.exit(1);
}
if (!skipSeed) {
  await copyInstitutions();
  console.log('\n== putting the demo accounts back in the test database ==');
  run('npm', ['run', 'db:seed:demo', '--', '--clear'], api);
  if (run('npm', ['run', 'db:seed:demo'], api).status !== 0) process.exit(1);
}

/* ── the two servers ── */
const servers = [];
const start = (name, cmd, cmdArgs, cwd) => {
  const p = spawn(cmd, cmdArgs, { cwd, env: copy, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', (d) => process.env.E2E_VERBOSE && process.stdout.write(`[${name}] ${d}`));
  p.stderr.on('data', (d) => process.env.E2E_VERBOSE && process.stderr.write(`[${name}] ${d}`));
  servers.push(p);
};
const stopAll = () => { for (const p of servers) if (p.pid) spawnSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], { stdio: 'ignore' }); };
process.on('exit', stopAll);
process.on('SIGINT', () => { stopAll(); process.exit(130); });

async function waitFor(url, label) {
  for (let i = 0; i < 90; i += 1) {
    try { if ((await fetch(url)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.error(`${label} did not start (${url}).`);
  stopAll();
  process.exit(1);
}

start('api', 'npx', ['tsx', 'src/index.ts'], api);
start('web', 'npx', ['next', 'start', '-p', String(WEB_PORT)], web);
await waitFor(`http://127.0.0.1:${API_PORT}/api/health`, 'The API');
await waitFor(`http://localhost:${WEB_PORT}/login`, 'The web site');
console.log(`\n== the copy is up: web ${WEB_PORT}, API ${API_PORT}, database darp_test ==\n`);

const result = run('npx', ['playwright', 'test', ...args], web, { APP_URL: `http://localhost:${WEB_PORT}`, E2E_NO_SERVERS: '1' });
stopAll();
process.exit(result.status ?? 1);
