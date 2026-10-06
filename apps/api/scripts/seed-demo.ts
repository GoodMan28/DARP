/**
 * Demo data for sign-off review. NOT for production.
 *
 *   npm run db:seed:demo               populate
 *   npm run db:seed:demo -- --clear    remove every trace
 *
 * Values are generated FROM each module's own config, so this stays valid when a
 * config changes: every field is filled according to its declared type, master
 * list and constraints, with realistic overrides for the headline fields.
 *
 * Everything it creates is marked: demo accounts all use the @demo.bitmesra.ac.in
 * domain, so `--clear` deletes them and their records without touching real data.
 */
import pg from 'pg';
import { eq } from 'drizzle-orm';
import { db, pool } from '../src/server/db';
import { users, departments, cycles } from '../src/server/db/schema';
import { hashPassword } from '../src/server/auth/password';
import { createRecord, transitionRecord } from '../src/server/records/service';
import { getAllLists } from '../src/server/records/masterLists';
import { MODULES } from '@darp/shared/modules';
import type { FieldConfig, ModuleConfig, Role } from '@darp/shared/modules/types';
import type { SessionUser } from '../src/server/auth/session';

// Demo data is generated offline: never call a publisher register while seeding.
process.env.LOOKUP_OFFLINE = '1';

const DEMO_DOMAIN = '@demo.bitmesra.ac.in';
const DEMO_PASSWORD = 'DarpDemo!2026Pass';

/* ─────────────────────────── demo people ─────────────────────────── */

interface DemoPerson { key: string; name: string; role: Role; dept?: string; joined?: string }

const PEOPLE: DemoPerson[] = [
  { key: 'verma', name: 'Dr A. K. Verma', role: 'faculty', dept: 'CSE', joined: '2011-07-18' },
  { key: 'mahato', name: 'Dr S. Mahato', role: 'faculty', dept: 'CSE', joined: '2016-01-04' },
  { key: 'ranjan', name: 'Dr P. Ranjan', role: 'faculty', dept: 'EEE', joined: '2009-08-03' },
  { key: 'kujur', name: 'Dr N. Kujur', role: 'faculty', dept: 'ME', joined: '2018-07-02' },
  { key: 'hodcse', name: 'Prof. R. K. Sinha', role: 'hod', dept: 'CSE', joined: '2004-06-15' },
  { key: 'hodme', name: 'Prof. M. Tirkey', role: 'hod', dept: 'ME', joined: '2006-09-11' },
  { key: 'dofa', name: 'Dean of Faculty Affairs', role: 'dofa' },
  { key: 'drie', name: 'Dean of Research, Innovation & Entrepreneurship', role: 'drie' },
  { key: 'dugs', name: 'Dean of UG & PG Studies', role: 'dugs' },
  { key: 'cdc', name: 'Career Development Centre', role: 'cdc' },
  { key: 'iqac', name: 'IQAC Demo Administrator', role: 'admin' },
];

/* ───────────────────── realistic sample values ───────────────────── */

const TITLES = [
  'Energy-aware task scheduling for the edge–cloud continuum',
  'A federated learning scheme for heterogeneous IoT gateways',
  'Latency-bounded container placement in fog clusters',
  'Trust-aware routing for vehicular sensor networks',
  'Optimal placement of distributed generation in radial feeders',
  'Microgrid stability under high renewable penetration',
  'Thermal analysis of additively manufactured heat exchangers',
  'Adaptive workload migration across edge nodes',
];

const JOURNALS = [
  'IEEE Transactions on Cloud Computing',
  'Future Generation Computer Systems',
  'The Journal of Supercomputing',
  'Journal of Network and Computer Applications',
  'IEEE Transactions on Power Systems',
  'Applied Thermal Engineering',
];

const AGENCIES = [
  'Science and Engineering Research Board (SERB)',
  'Department of Science and Technology',
  'Indian Council of Medical Research',
  'Ministry of Education, Government of India',
  'Council of Scientific and Industrial Research',
];

const ORGANISATIONS = [
  'Tata Consultancy Services Ltd',
  'Bharat Heavy Electricals Ltd',
  'Central Coalfields Ltd',
  'Indian Institute of Technology Kharagpur',
  'National Institute of Technology Rourkela',
];

const STUDENT_NAMES = [
  'Anita Kumari', 'Rahul Oraon', 'Priya Singh', 'Sameer Ekka', 'Nisha Mahto',
  'Vikash Gupta', 'Sunita Devi', 'Arjun Munda',
];

const PEOPLE_NAMES = [
  'Dr A. K. Verma', 'Dr S. Mahato', 'Dr P. Ranjan', 'Prof. R. K. Sinha', 'Dr N. Kujur',
];

const PROGRAMMES = [
  'Faculty Development Programme on Machine Learning Systems',
  'Short term course on Research Methodology',
  'Workshop on High-Performance Computing',
  'Orientation Programme for newly recruited faculty',
  'Refresher course on Outcome-Based Education',
];

const INSTITUTIONS = [
  'Indian Institute of Technology Kharagpur',
  'Indian Institute of Science, Bengaluru',
  'National Institute of Technology Jamshedpur',
  'Birla Institute of Technology, Mesra',
];

/* ───────────────────────── value generation ───────────────────────── */

/** Deterministic pseudo-randomness, so repeated runs look the same. */
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
const VERHOEFF_INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

/** Builds a 12-digit number that passes the real Aadhaar check-digit algorithm. */
function makeAadhaar(rng: () => number): string {
  const first = 2 + Math.floor(rng() * 8);                       // never 0 or 1
  let body = String(first);
  for (let i = 0; i < 10; i++) body += Math.floor(rng() * 10);
  let c = 0;
  const reversed = body.split('').reverse().map(Number);
  for (let i = 0; i < reversed.length; i++) {
    c = VERHOEFF_D[c]![VERHOEFF_P[(i + 1) % 8]![reversed[i]!]!]!;
  }
  return body + String(VERHOEFF_INV[c]!);
}

function makePan(rng: () => number): string {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const letter = () => A[Math.floor(rng() * 26)]!;
  return `${letter()}${letter()}${letter()}P${letter()}${String(1000 + Math.floor(rng() * 9000))}${letter()}`;
}

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

interface GenContext {
  rng: () => number;
  lists: Record<string, string[]>;
  person: DemoPerson;
  index: number;
  cycleYears: number[];
  /** Field keys that form this module's duplicate guard — they must not collide. */
  uniqueKeys: Set<string>;
}

/** One plausible, valid value for a field, decided entirely by its config. */
function valueFor(f: FieldConfig, ctx: GenContext): unknown {
  const { rng, lists } = ctx;
  const label = f.label.toLowerCase();
  // A field in the duplicate guard has to differ between records, or the seeder
  // spends its time proving the guard works instead of producing data.
  const unique = ctx.uniqueKeys.has(f.key);

  if (f.listKey) {
    const options = lists[f.listKey] ?? [];
    if (options.length > 0) {
      return unique ? options[ctx.index % options.length]! : pick(options, rng);
    }
  }
  if (f.options?.length) {
    return unique ? f.options[ctx.index % f.options.length]! : pick(f.options, rng);
  }

  switch (f.type) {
    case 'doi':
      return `10.${1000 + (ctx.index % 8999)}/darp.demo.${ctx.index}`;
    case 'issn':
      return `${1000 + Math.floor(rng() * 8999)}-${100 + Math.floor(rng() * 899)}X`;
    case 'isbn': {
      const core = `978${String(Math.floor(rng() * 1e9)).padStart(9, '0')}`;
      const sum = [...core].reduce((a, ch, i) => a + Number(ch) * (i % 2 === 0 ? 1 : 3), 0);
      return core + String((10 - (sum % 10)) % 10);
    }
    case 'email':
      return `${ctx.person.key}.demo@bitmesra.ac.in`;
    case 'phone':
      return `98${String(Math.floor(rng() * 100000000)).padStart(8, '0')}`;
    case 'url':
      return 'https://www.bitmesra.ac.in/';
    case 'aadhaar':
      return makeAadhaar(rng);
    case 'pan':
      return makePan(rng);
    case 'money':
      return unique
        ? String((5 + (ctx.index % 90)) * 100000 + ctx.index * 137)
        : String((5 + Math.floor(rng() * 90)) * 100000);           // ₹5 lakh – ₹95 lakh
    case 'year':
      return String(unique
        ? ctx.cycleYears[ctx.index % ctx.cycleYears.length]!
        : pick(ctx.cycleYears, rng));
    case 'date': {
      if (unique) {
        const y = ctx.cycleYears[ctx.index % ctx.cycleYears.length]!;
        const mo = String(1 + (ctx.index % 12)).padStart(2, '0');
        const d = String(1 + (ctx.index % 28)).padStart(2, '0');
        return `${y}-${mo}-${d}`;
      }
      const y = pick(ctx.cycleYears, rng);
      const mo = String(1 + Math.floor(rng() * 12)).padStart(2, '0');
      const d = String(1 + Math.floor(rng() * 28)).padStart(2, '0');
      return `${y}-${mo}-${d}`;
    }
    case 'integer': {
      const min = f.min ?? 0;
      const max = Math.min(f.max ?? 120, 300);
      return String(min + Math.floor(rng() * Math.max(max - min, 1)));
    }
    case 'checkbox':
      return rng() > 0.5;
    case 'multiselect':
      return [];
    case 'file':
      return '';                                                   // evidence is uploaded, not seeded
    case 'textarea':
      if (label.includes('bibliograph') || label.includes('citation')) {
        return `${pick(PEOPLE_NAMES, rng)}. "${pick(TITLES, rng)}." ${pick(JOURNALS, rng)} (${pick(ctx.cycleYears, rng)}).`;
      }
      return `${pick(TITLES, rng)}. Recorded for demonstration during sign-off review.`;
    default: {
      // text — choose by what the column is actually asking for
      const salt = unique ? ` ${ctx.index}` : '';
      if (f.normalise === 'patentNumber') {
        // Kolkata office (3), ordinary application (1): YYYY 3 1 NNNNNN, unique per record.
        return `${2021 + (ctx.index % 4)}31${String(100000 + ctx.index).padStart(6, '0')}`;
      }
      if (label.includes('roll') || label.includes('registration') || label.includes('enrol')
        || label.includes('code') || label.includes('application')) {
        return `BIT/${2020 + (ctx.index % 5)}/${1000 + ctx.index}`;
      }
      if (unique) {
        if (label.includes('student')) return `${pick(STUDENT_NAMES, rng)}${salt}`;
        if (label.includes('organisation') || label.includes('organization') || label.includes('partner')) {
          return `${pick(ORGANISATIONS, rng)}${salt}`;
        }
        if (label.includes('email')) return `demo${ctx.index}@bitmesra.ac.in`;
        return `${pick(TITLES, rng)}${salt}`;
      }
      if (label.includes('journal')) return pick(JOURNALS, rng);
      if (label.includes('agency') || label.includes('funding')) return pick(AGENCIES, rng);
      if (label.includes('organisation') || label.includes('organization') || label.includes('partner') || label.includes('employer')) {
        return pick(ORGANISATIONS, rng);
      }
      if (label.includes('institution') || label.includes('institute') || label.includes('university')) {
        return pick(INSTITUTIONS, rng);
      }
      if (label.includes('student')) return pick(STUDENT_NAMES, rng);
      if (label.includes('programme') || label.includes('program') || label.includes('course')) {
        return pick(PROGRAMMES, rng);
      }
      if (label.includes('author') || label.includes('inventor') || label.includes('name of the')) {
        return pick(PEOPLE_NAMES, rng);
      }
      if (label.includes('name')) return ctx.person.name;
      if (label.includes('title')) return pick(TITLES, rng);
      if (label.includes('roll') || label.includes('registration') || label.includes('enrol')) {
        return `BIT/${2020 + Math.floor(rng() * 5)}/${1000 + Math.floor(rng() * 8999)}`;
      }
      if (label.includes('application') || label.includes('code')) {
        return `2024310${String(Math.floor(rng() * 100000)).padStart(5, '0')}`;
      }
      if (label.includes('email')) return `${ctx.person.key}.demo@bitmesra.ac.in`;
      if (label.includes('country')) return 'India';
      if (label.includes('duration')) return `${1 + Math.floor(rng() * 3)} years`;
      if (label.includes('specialis') || label.includes('specializ')) return 'Computer Science & Engineering';
      if (label.includes('purpose') || label.includes('activit')) {
        return 'Joint research, internships and faculty exchange';
      }
      return pick(TITLES, rng);
    }
  }
}

/** A full, valid record for a module — visible fields only, honouring showIf. */
function buildRecord(m: ModuleConfig, ctx: GenContext): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const f of m.fields) {
    if (f.showIf) {
      const decided = values[f.showIf.field];
      if (typeof decided !== 'string' || !f.showIf.in.includes(decided)) continue;
    }
    if (f.type === 'file') continue;                     // nothing to upload in a seed
    if (!f.required && ctx.rng() < 0.25) continue;        // leave some optional fields blank
    values[f.key] = valueFor(f, ctx);
  }
  return values;
}

/* ──────────────────────────── clearing ───────────────────────────── */

/**
 * Runs as the database OWNER, not the application user: `record_transitions` and
 * `audit_log` are append-only for the app by design (harden-db.ts), so the app
 * could not remove demo history even if it wanted to. That is the point.
 */
async function clear() {
  const ownerUrl = process.env.DATABASE_URL_OWNER;
  if (!ownerUrl) throw new Error('DATABASE_URL_OWNER is required to clear demo data');
  const owner = new pg.Pool({ connectionString: ownerUrl, max: 1 });
  try {
    const { rows } = await owner.query<{ id: string }>(
      'select id from users where email like $1', [`%${DEMO_DOMAIN}`],
    );
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) {
      console.error('no demo accounts found — nothing to clear');
      return;
    }
    const recs = await owner.query<{ id: string }>(
      'select id from records where owner_user_id = any($1::uuid[])', [ids],
    );
    const recIds = recs.rows.map((r) => r.id);
    if (recIds.length > 0) {
      await owner.query('delete from record_transitions where record_id = any($1::uuid[])', [recIds]);
      await owner.query('delete from evidence_files where record_id = any($1::uuid[])', [recIds]);
      await owner.query('delete from records where id = any($1::uuid[])', [recIds]);
    }
    await owner.query('delete from module_declarations where user_id = any($1::uuid[])', [ids]);
    await owner.query('delete from profile_baselines where user_id = any($1::uuid[])', [ids]);
    await owner.query('delete from sessions where user_id = any($1::uuid[])', [ids]);
    // audit_log rows are deliberately left alone: the trigger refuses every delete,
    // from the owner too, and audit_log holds no foreign key to users, so the accounts
    // can go while their history stays. That is the append-only guarantee working.
    await owner.query('delete from users where id = any($1::uuid[])', [ids]);
    console.error(`cleared ${ids.length} demo accounts and ${recIds.length} demo records`);
    console.error('audit_log entries were kept — it is append-only by design.');
  } finally {
    await owner.end();
  }
}

/* ───────────────────────────── main ──────────────────────────────── */

async function main() {
  if (process.argv.includes('--clear')) {
    await clear();
    await pool.end();
    return;
  }

  const [cycle] = await db.select().from(cycles).where(eq(cycles.isActive, true));
  if (!cycle) throw new Error('no active cycle — run npm run db:seed first');

  const cycleYears = [2022, 2023, 2024];
  const lists = await getAllLists();
  const depts = await db.select().from(departments);
  const deptByCode = new Map(depts.map((d) => [d.code, d]));

  const hash = await hashPassword(DEMO_PASSWORD);
  const actors = new Map<string, SessionUser>();
  const personOf = new Map<string, DemoPerson>();

  for (const p of PEOPLE) {
    const email = `${p.key}${DEMO_DOMAIN}`;
    const dept = p.dept ? deptByCode.get(p.dept) : undefined;
    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const row = existing[0] ?? (await db.insert(users).values({
      email,
      name: p.name,
      role: p.role,
      departmentId: dept?.id ?? null,
      dateOfJoining: p.joined ?? null,
      passwordHash: hash,
      mustChangePassword: false,      // demo accounts sign straight in
    }).returning())[0]!;

    actors.set(p.key, {
      id: row.id,
      email: row.email,
      name: row.name,
      role: p.role,
      departmentId: row.departmentId,
      departmentName: dept?.name ?? null,
      departmentCode: dept?.code ?? null,
      dateOfJoining: row.dateOfJoining,
      mustChangePassword: false,
      sessionId: `demo-${p.key}`,
    });
    personOf.set(p.key, p);
  }

  /* how many records each role's modules get */
  const PLAN: Array<{ personKey: string; moduleKey: string; n: number }> = [];
  const facultyKeys = ['verma', 'mahato', 'ranjan', 'kujur'];
  const facultyModules = Object.values(MODULES).filter((m) => m.ownerRoles.includes('faculty'));
  for (const pk of facultyKeys) {
    for (const m of facultyModules) {
      // Profile is one per person per cycle; everything else gets a couple of rows.
      PLAN.push({ personKey: pk, moduleKey: m.key, n: m.key === 'profile' ? 1 : 2 });
    }
  }
  for (const pk of ['hodcse', 'hodme']) {
    for (const m of Object.values(MODULES).filter((x) => x.ownerRoles.includes('hod'))) {
      PLAN.push({ personKey: pk, moduleKey: m.key, n: 2 });
    }
  }
  for (const m of Object.values(MODULES).filter((x) => x.ownerRoles.includes('dofa'))) {
    PLAN.push({ personKey: 'dofa', moduleKey: m.key, n: 3 });
  }
  for (const m of Object.values(MODULES).filter((x) => x.ownerRoles.includes('cdc'))) {
    PLAN.push({ personKey: 'cdc', moduleKey: m.key, n: 4 });
  }

  const made: Array<{ moduleKey: string; id: string }> = [];
  const failures = new Map<string, string>();
  let index = 0;

  for (const step of PLAN) {
    const actor = actors.get(step.personKey)!;
    const person = personOf.get(step.personKey)!;
    const m = MODULES[step.moduleKey]!;
    for (let i = 0; i < step.n; i++) {
      index += 1;
      const ctx: GenContext = {
        rng: makeRng(index * 7919),
        lists,
        person,
        index,
        cycleYears,
        uniqueKeys: new Set(m.naturalKey ?? []),
      };
      const values = buildRecord(m, ctx);
      // Every fourth record stays a draft, so the dashboards show work in progress.
      const mode = index % 4 === 0 ? 'draft' : 'submit';
      try {
        const r = await createRecord(actor, m.key, values, mode);
        made.push({ moduleKey: m.key, id: r.id });
      } catch (e) {
        if (!failures.has(m.key)) {
          const fields = (e as { fields?: Record<string, string> }).fields;
          failures.set(
            m.key,
            fields ? Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join('; ') : (e as Error).message,
          );
        }
      }
    }
  }

  /* move records through the workflow so every state is represented */
  const verifierOf = (moduleKey: string): SessionUser | null => {
    const m = MODULES[moduleKey]!;
    const role = m.verifierRoles[0];
    if (!role) return null;
    if (role === 'admin') return actors.get('iqac')!;
    return actors.get(role) ?? null;
  };

  const iqac = actors.get('iqac')!;
  let verified = 0; let approved = 0; let returned = 0;

  for (const [i, rec] of made.entries()) {
    const verifier = verifierOf(rec.moduleKey);
    if (!verifier) continue;
    try {
      if (i % 9 === 4) {
        await transitionRecord(verifier, rec.moduleKey, rec.id, 'return',
          'The evidence attached does not match the figures entered. Please correct and resubmit.');
        returned += 1;
        continue;
      }
      await transitionRecord(verifier, rec.moduleKey, rec.id, 'verify');
      verified += 1;
      if (i % 2 === 0) {
        await transitionRecord(iqac, rec.moduleKey, rec.id, 'approve');
        approved += 1;
      }
    } catch {
      // Drafts cannot be verified — intentional variety, not an error.
    }
  }

  console.error('');
  console.error(`demo data ready: ${PEOPLE.length} accounts, ${made.length} records`);
  console.error(`  ${verified} verified · ${approved} approved · ${returned} returned`);
  if (failures.size > 0) {
    console.error('  modules that produced no records (config needs a closer look):');
    for (const [k, msg] of failures) console.error(`    ${k}: ${msg}`);
  }
  console.error('');
  console.error(`sign in as: ${PEOPLE.map((p) => p.key + DEMO_DOMAIN).join(', ')}`);
  console.error(`password for every demo account: ${DEMO_PASSWORD}`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
