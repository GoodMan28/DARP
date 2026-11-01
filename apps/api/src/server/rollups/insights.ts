import { and, asc, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/server/db';
import { records, users, departments, paperCitations, researcherMetrics, appSettings } from '@/server/db/schema';
import type { SessionUser } from '@/server/auth/session';
import { ServiceError } from '@/server/records/service';
import { boundsOfRange, type YearRange } from '@/server/records/range';
import { rankingsFor, rankingItemOf } from '@/server/journals/ranking';
import { namesMatch } from '@/server/lookup/names';
import { partsOf } from '@/server/lookup/identity';
import { splitAuthors } from '@/server/lookup/apply';
import { SYSTEM_EMAIL } from '@/server/lookup/system';
import { COUNTED_STATUSES, computeCounters, moneyOf } from './counters';
import { moduleStatusForUser } from './completion';
import { getModule, OUTREACH_TYPES } from '@darp/shared/modules';
import { FACULTY_MEMBERS, type PeriodType } from '@darp/shared/modules/types';
import { isOutsideBit } from '@darp/shared/affiliation';
import { hIndex } from '@darp/shared/research';
import type { JournalRanking } from '@darp/shared/journals';
import type { NameParts } from '@darp/shared/names';
import { canSeeCollege, canSeeDepartment, canSeePerson, type HIndexPapers, HINDEX_PAPERS } from '@darp/shared/insights';
import type {
  Insights, InsightCounts, QuartileSplit, CitationSummary, InsightPaper, PersonCard, TodoItem,
  PersonInsights, DepartmentInsights, CollegeInsights,
} from '@darp/shared/contracts';

/*
 * The figures behind the Overview, department and college pages. Nothing here is stored: every number is
 * worked out when asked for, so a change to a record, a journal list or an account shows at once.
 *
 * These are aggregates that a person may not see row by row (a colleague's paper is counted but its
 * record is not opened), so the check is `canSeePerson`, `canSeeDepartment` and `canSeeCollege` from
 * @darp/shared/insights, made before any row is read, and `scopeFilter` is deliberately not used. Only the
 * fields named in the contract leave this file: no e-mail, phone, PAN, Aadhaar or pay, and money only
 * as totals (a department or the college) or on the page of the person it belongs to.
 */

/** The modules these pages read. */
const USED = ['publications', 'books', 'patents', 'grants', 'consultancy', 'awards', 'riawards', 'extawards', 'fellowships', 'fdpattended', 'outreach', 'econtent', 'studentsguided'];
const PAPER_MODULES = ['publications', 'books'];
const AWARD_MODULES = ['awards', 'riawards', 'extawards'];
const SETTING_KEY = 'insights.hIndexPapers';
const ALL_YEARS: YearRange = { from: 1990, to: 2100 };

const periodTypeOf = (moduleKey: string): PeriodType => getModule(moduleKey)?.periodType ?? 'CY';

/* ═════════════════════════ IQAC's setting ═════════════════════════ */

/** What the department and college h-index counts: every paper (the default), or only those done at BIT. */
export async function getHIndexPapers(): Promise<HIndexPapers> {
  const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, SETTING_KEY)).limit(1);
  const v = (row?.value as { value?: unknown } | undefined)?.value;
  return HINDEX_PAPERS.includes(v as HIndexPapers) ? (v as HIndexPapers) : 'all';
}

export async function setHIndexPapers(actor: SessionUser, value: HIndexPapers): Promise<HIndexPapers> {
  if (actor.role !== 'admin') throw new ServiceError('FORBIDDEN', 'Only IQAC may change this.');
  if (!HINDEX_PAPERS.includes(value)) throw new ServiceError('VALIDATION', 'Choose all papers, or only papers done at BIT.');
  await db.insert(appSettings).values({ key: SETTING_KEY, value: { value }, updatedBy: actor.id })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: { value }, updatedBy: actor.id, updatedAt: new Date() } });
  return value;
}

/* ═════════════════════════ rows and people ═════════════════════════ */

interface Row {
  id: string; moduleKey: string; periodYear: number; status: typeof records.$inferSelect['status'];
  data: Record<string, unknown>; ownerUserId: string; departmentId: string | null;
}

async function loadRows(where?: SQL): Promise<Row[]> {
  const rows = await db.select({
    id: records.id, moduleKey: records.moduleKey, periodYear: records.periodYear, status: records.status,
    data: records.data, ownerUserId: records.ownerUserId, departmentId: records.departmentId,
  }).from(records).where(and(
    isNull(records.deletedAt), inArray(records.moduleKey, USED), inArray(records.status, COUNTED_STATUSES), where,
  ));
  return rows.map((r) => ({ ...r, data: (r.data ?? {}) as Record<string, unknown> }));
}

interface Person {
  id: string; name: string; parts: NameParts | string; departmentId: string | null; departmentCode: string | null;
  departmentName: string | null; designation: string; orcid: string | null; role: SessionUser['role'];
}

const NOT_FILLED = 'Not filled in';

/** Active faculty members (not the automatic-check account), with their department and designation. */
async function loadPeople(where?: SQL): Promise<Person[]> {
  const us = await db.select({
    id: users.id, name: users.name, prefix: users.namePrefix, first: users.firstName, middle: users.middleName,
    last: users.lastName, departmentId: users.departmentId, code: departments.code, dept: departments.name,
    orcid: users.orcid, role: users.role,
  }).from(users).leftJoin(departments, eq(users.departmentId, departments.id)).where(and(
    eq(users.isActive, true), inArray(users.role, FACULTY_MEMBERS), sql`${users.email} <> ${SYSTEM_EMAIL}`, where,
  ));
  if (us.length === 0) return [];
  const profiles = await db.select({ owner: records.ownerUserId, designation: sql<string>`coalesce(${records.data} ->> 'designation', '')` })
    .from(records).where(and(eq(records.moduleKey, 'profile'), isNull(records.deletedAt), inArray(records.ownerUserId, us.map((u) => u.id))));
  const designation = new Map(profiles.map((p) => [p.owner, p.designation.trim()]));
  return us.map((u) => ({
    id: u.id, name: u.name, parts: partsOf({ name: u.name, prefix: u.prefix, first: u.first, middle: u.middle, last: u.last }),
    departmentId: u.departmentId, departmentCode: u.code, departmentName: u.dept, orcid: u.orcid, role: u.role,
    designation: designation.get(u.id) || NOT_FILLED,
  }));
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const letters = (s: string): string => s.normalize('NFKD').replace(/[^A-Za-z ]+/g, ' ').toLowerCase();

/** The word a name is looked for by: the surname, or the only name there is. */
function keyWord(p: Person): string {
  const w = typeof p.parts === 'string'
    ? letters(p.parts).split(/\s+/).filter(Boolean).pop()
    : letters(p.parts.last).split(/\s+/).filter(Boolean).pop() ?? letters(`${p.parts.first} ${p.parts.middle}`).split(/\s+/).filter(Boolean).pop();
  return w ?? '';
}

/**
 * Which departments a paper belongs to: its owner's, and the department of every active faculty member
 * whose name matches an author in its `authors` text. A cheap look at first letters and word lengths
 * keeps `namesMatch` (the careful comparison, with transliteration) for a handful of people per author.
 */
function paperDepartments(row: Row, byLetter: Map<string, Person[]>, memo: Map<string, string[]>): Set<string> {
  const out = new Set<string>();
  if (row.departmentId) out.add(row.departmentId);
  for (const author of splitAuthors(str(row.data.authors))) {
    // The same name is on many papers: its departments are worked out once for this request (nothing is kept between requests).
    const seen = memo.get(author);
    if (seen) { for (const d of seen) out.add(d); continue; }
    const found = new Set<string>();
    const words = letters(author).split(/\s+/).filter((w) => w.length >= 2);
    const tried = new Set<string>();
    for (const w of words) {
      for (const p of byLetter.get(w[0]!) ?? []) {
        if (tried.has(p.id) || !p.departmentId || Math.abs(keyWord(p).length - w.length) > 2) continue;
        tried.add(p.id);
        if (!found.has(p.departmentId) && namesMatch(p.parts, { given: '', family: '', full: author })) found.add(p.departmentId);
      }
    }
    memo.set(author, [...found]);
    for (const d of found) out.add(d);
  }
  return out;
}

function indexByLetter(people: Person[]): Map<string, Person[]> {
  const m = new Map<string, Person[]>();
  for (const p of people) {
    const k = keyWord(p);
    if (k.length < 2) continue;
    m.set(k[0]!, [...(m.get(k[0]!) ?? []), p]);
  }
  return m;
}

/** The department's rows: those it owns, and every paper or book with an author of its own. */
function rowsOfDepartment(deptId: string, all: Row[], matched: Map<string, Set<string>>): Row[] {
  return all.filter((r) => (PAPER_MODULES.includes(r.moduleKey) ? matched.get(r.id)?.has(deptId) : r.departmentId === deptId));
}

/* ═════════════════════════ the figures ═════════════════════════ */

interface Cite { found: boolean; citedBy: number; checkedAt: Date }
interface Ctx {
  range: YearRange | null; hMode: HIndexPapers; rankings: Map<string, JournalRanking>; cites: Map<string, Cite>;
}

async function contextFor(rows: Row[], range: YearRange | null): Promise<Ctx> {
  const [rankings, cites, hMode] = await Promise.all([
    rankingsFor(rows.filter((r) => r.moduleKey === 'publications').map((r) => rankingItemOf(r.id, r.data))),
    db.select().from(paperCitations),
    getHIndexPapers(),
  ]);
  return { range, hMode, rankings, cites: new Map(cites.map((c) => [c.doi, { found: c.found, citedBy: c.citedBy, checkedAt: c.checkedAt }])) };
}

const outside = (r: Row) => isOutsideBit(getModule(r.moduleKey), r.data);
const doiOf = (r: Row) => str(r.data.doi).toLowerCase();

/** The same work entered by two colleagues counts once in a group: papers by DOI, patents by application, projects by title and date. */
function dedupe(rows: Row[]): Row[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const k = r.moduleKey === 'publications' || r.moduleKey === 'books' ? doiOf(r)
      : r.moduleKey === 'patents' ? str(r.data.applicationNo).toLowerCase()
        : r.moduleKey === 'grants' ? `${str(r.data.title).toLowerCase()}|${str(r.data.sanctionDate)}` : '';
    if (!k || k === '|') return true;
    const key = `${r.moduleKey}:${k}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const split = (qs: Array<string | null | undefined>): QuartileSplit => {
  const out: QuartileSplit = { q1: 0, q2: 0, q3: 0, q4: 0, none: 0 };
  for (const q of qs) {
    const k = (q ?? '').toLowerCase();
    if (k === 'q1' || k === 'q2' || k === 'q3' || k === 'q4') out[k] += 1; else out.none += 1;
  }
  return out;
};

const WOS = ['SCIE', 'SSCI', 'AHCI', 'ESCI'];

function citationsOf(rows: Row[], ctx: Ctx): CitationSummary {
  const dois = new Set<string>();
  let noDoi = 0;
  for (const r of rows) { const d = doiOf(r); if (d) dois.add(d); else noDoi += 1; }
  let found = 0; let notInScopus = 0; let notChecked = 0; let last = 0;
  const counts: number[] = [];
  for (const d of dois) {
    const c = ctx.cites.get(d);
    if (!c) { notChecked += 1; continue; }
    last = Math.max(last, c.checkedAt.getTime());
    if (c.found) { found += 1; counts.push(c.citedBy); } else notInScopus += 1;
  }
  return {
    citations: counts.reduce((a, b) => a + b, 0), hIndex: hIndex(counts), found, notInScopus, notChecked, noDoi,
    lastChecked: last ? new Date(last).toISOString() : null, counts: ctx.hMode,
  };
}

/** Everything the three pages show about a group of records. */
function summarise(all: Row[], ctx: Ctx): Insights {
  const { range } = ctx;
  const inRange = (r: Row) => !range || (r.periodYear >= range.from && r.periodYear <= range.to);
  const atBit = dedupe(all.filter((r) => !outside(r)));

  // One counting rule for every page: the profile counters (patent stages, money, "No" left out).
  const fig = computeCounters(
    atBit.map((r) => ({ moduleKey: r.moduleKey, periodYear: r.periodYear, status: r.status, data: r.data })),
    boundsOfRange(range ?? ALL_YEARS), periodTypeOf,
  );
  const w = range ? 'cycle' : 'sinceJoining';
  const n = (...keys: string[]) => keys.reduce((a, k) => a + (fig[`${k}.${w}`] ?? 0), 0);
  const counts: InsightCounts = {
    papers: n('publications.count'), books: n('books.count.book'), chapters: n('books.count.chapter'),
    conferencePapers: n('books.count.conference'),
    patentsFiled: n('patents.count.filed'), patentsPublished: n('patents.count.published'), patentsGranted: n('patents.count.granted'),
    projects: n('grants.count.pi', 'grants.count.copi'), projectFunding: n('grants.sum.pi', 'grants.sum.copi'),
    consultancyRevenue: n('consultancy.sum.consultancy', 'consultancy.sum.training'),
    awards: n('awards.count', 'riawards.count', 'extawards.count'),
    fellowships: n('fellowships.count'), fdps: n('fdpattended.count'), outreach: n('outreach.count'), econtent: n('econtent.count'),
    studentsUg: n('studentsguided.count.ug'), studentsPg: n('studentsguided.count.pg'), studentsPhd: n('studentsguided.count.phd'),
  };

  const scoped = atBit.filter(inRange);
  const papers = scoped.filter((r) => r.moduleKey === 'publications');
  const rankOf = (r: Row) => ctx.rankings.get(r.id);

  const years = new Map<number, { papers: number; books: number; patents: number; projects: number; funding: number }>();
  const slot = (y: number) => { let s = years.get(y); if (!s) { s = { papers: 0, books: 0, patents: 0, projects: 0, funding: 0 }; years.set(y, s); } return s; };
  for (const r of scoped) {
    if (r.moduleKey === 'publications') slot(r.periodYear).papers += 1;
    else if (r.moduleKey === 'books') slot(r.periodYear).books += 1;
    else if (r.moduleKey === 'patents') slot(r.periodYear).patents += 1;
    else if (r.moduleKey === 'grants') { const s = slot(r.periodYear); s.projects += 1; s.funding += moneyOf(r.data, 'amount'); }
  }

  const journals = new Map<string, { journal: string; papers: number; jif: string | null }>();
  for (const r of papers) {
    const name = str(r.data.journal);
    if (!name) continue;
    const key = name.toLowerCase();
    const j = journals.get(key) ?? { journal: name, papers: 0, jif: null };
    j.papers += 1;
    j.jif ??= rankOf(r)?.jif ?? null;
    journals.set(key, j);
  }
  const funders = new Map<string, { agency: string; projects: number; amount: number }>();
  for (const r of scoped.filter((x) => x.moduleKey === 'grants')) {
    const name = str(r.data.agency);
    if (!name) continue;
    const f = funders.get(name.toLowerCase()) ?? { agency: name, projects: 0, amount: 0 };
    f.projects += 1; f.amount += moneyOf(r.data, 'amount');
    funders.set(name.toLowerCase(), f);
  }

  // The h-index reads every paper by default (IQAC's setting), the others only those done at BIT.
  const citeRows = dedupe((ctx.hMode === 'all' ? all : atBit).filter((r) => PAPER_MODULES.includes(r.moduleKey) && inRange(r)));

  return {
    range,
    byYear: [...years.entries()].sort((a, b) => a[0] - b[0]).map(([year, v]) => ({ year, ...v })),
    counts,
    jif: split(papers.map((r) => rankOf(r)?.jifQuartile)),
    sjr: split(papers.map((r) => rankOf(r)?.sjrQuartile)),
    indexed: papers.reduce((a, r) => {
      const ix = rankOf(r)?.indexes ?? [];
      const sc = ix.includes('Scopus'); const wo = ix.some((i) => WOS.includes(i));
      return { scopus: a.scopus + (sc ? 1 : 0), wos: a.wos + (wo ? 1 : 0), neither: a.neither + (sc || wo ? 0 : 1) };
    }, { scopus: 0, wos: 0, neither: 0 }),
    citations: citationsOf(citeRows, ctx),
    topJournals: [...journals.values()].sort((a, b) => b.papers - a.papers || a.journal.localeCompare(b.journal)).slice(0, 8),
    funders: [...funders.values()].sort((a, b) => b.projects - a.projects || b.amount - a.amount).slice(0, 8),
  };
}

function recentPapers(all: Row[], ctx: Ctx): InsightPaper[] {
  const { range } = ctx;
  return dedupe(all.filter((r) => r.moduleKey === 'publications' && !outside(r) && (!range || (r.periodYear >= range.from && r.periodYear <= range.to))))
    .sort((a, b) => b.periodYear - a.periodYear || a.id.localeCompare(b.id)).slice(0, 8)
    .map((r) => {
      const rk = ctx.rankings.get(r.id);
      const c = ctx.cites.get(doiOf(r));
      return {
        id: r.id, title: str(r.data.title), journal: str(r.data.journal), year: r.periodYear, doi: str(r.data.doi),
        jif: rk?.jif ?? null, quartile: rk?.jifQuartile ?? rk?.sjrQuartile ?? null, citations: c?.found ? c.citedBy : null,
      };
    });
}

/** The rows of each owner, grouped once: a card for each of hundreds of people must not scan every row. */
function byOwner(rows: Row[]): Map<string, Row[]> {
  const m = new Map<string, Row[]>();
  for (const r of rows) { const l = m.get(r.ownerUserId); if (l) l.push(r); else m.set(r.ownerUserId, [r]); }
  return m;
}

function cardOf(p: Person, owned: Map<string, Row[]>, ctx: Ctx): PersonCard {
  const s = summarise(owned.get(p.id) ?? [], ctx);
  return {
    userId: p.id, name: p.name, designation: p.designation, department: p.departmentName ?? '', departmentCode: p.departmentCode,
    papers: s.counts.papers, patents: s.counts.patentsFiled, citations: s.citations.citations, hIndex: s.citations.hIndex, orcid: !!p.orcid,
  };
}

const designationsOf = (people: Person[]) => {
  const m = new Map<string, number>();
  for (const p of people) m.set(p.designation, (m.get(p.designation) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([designation, count]) => ({ designation, people: count }));
};

/* ═════════════════════════ a department ═════════════════════════ */

export async function departmentInsights(viewer: SessionUser, code: string, range: YearRange | null): Promise<DepartmentInsights> {
  const [dept] = await db.select().from(departments).where(sql`lower(${departments.code}) = lower(${code})`).limit(1);
  if (!dept) throw new ServiceError('NOT_FOUND', 'There is no such department.');
  if (!canSeeDepartment(viewer, dept.id)) throw new ServiceError('FORBIDDEN', 'You may not see this department.');

  const staff = (await loadPeople(eq(users.departmentId, dept.id)));
  const rows = await loadRows(or(eq(records.departmentId, dept.id), inArray(records.moduleKey, PAPER_MODULES)));
  const matched = new Map<string, Set<string>>();
  const byLetter = indexByLetter(staff);
  const memo = new Map<string, string[]>();
  for (const r of rows) if (PAPER_MODULES.includes(r.moduleKey)) matched.set(r.id, paperDepartments(r, byLetter, memo));
  const mine = rowsOfDepartment(dept.id, rows, matched);
  const ctx = await contextFor(mine, range);
  const reporting = new Set(mine.map((r) => r.ownerUserId));
  const owned = byOwner(mine);

  return {
    ...summarise(mine, ctx),
    department: { code: dept.code, name: dept.name },
    facultyTotal: staff.length,
    reporting: staff.filter((p) => reporting.has(p.id)).length,
    designations: designationsOf(staff),
    faculty: staff.map((p) => cardOf(p, owned, ctx)).sort((a, b) => b.papers - a.papers || a.name.localeCompare(b.name)),
    recentPapers: recentPapers(mine, ctx),
  };
}

/* ═════════════════════════ the college ═════════════════════════ */

export async function collegeInsights(viewer: SessionUser, range: YearRange | null): Promise<CollegeInsights> {
  if (!canSeeCollege(viewer.role)) throw new ServiceError('FORBIDDEN', 'You may not see the college.');
  const staff = (await loadPeople()).filter((p) => p.departmentId);
  const rows = await loadRows();
  const ctx = await contextFor(rows, range);
  const matched = new Map<string, Set<string>>();
  const byLetter = indexByLetter(staff);
  const memo = new Map<string, string[]>();
  for (const r of rows) if (PAPER_MODULES.includes(r.moduleKey)) matched.set(r.id, paperDepartments(r, byLetter, memo));
  const reporting = new Set(rows.map((r) => r.ownerUserId));

  const depts = await db.select().from(departments).where(eq(departments.isActive, true)).orderBy(asc(departments.code));
  const rowsByDept = depts.map((d) => {
    const mine = rowsOfDepartment(d.id, rows, matched);
    const s = summarise(mine, ctx);
    const people = staff.filter((p) => p.departmentId === d.id);
    return {
      code: d.code, name: d.name, faculty: people.length, papers: s.counts.papers, patents: s.counts.patentsFiled,
      projects: s.counts.projects, funding: s.counts.projectFunding, citations: s.citations.citations, hIndex: s.citations.hIndex,
    };
  });

  const owned = byOwner(rows);
  const cards = staff.map((p) => cardOf(p, owned, ctx));
  return {
    ...summarise(rows, ctx),
    facultyTotal: staff.length,
    reporting: staff.filter((p) => reporting.has(p.id)).length,
    departmentCount: depts.length,
    designations: designationsOf(staff),
    departments: rowsByDept,
    topByPapers: cards.filter((c) => c.papers > 0).sort((a, b) => b.papers - a.papers || a.name.localeCompare(b.name)).slice(0, 10),
    topByCitations: cards.filter((c) => c.citations > 0).sort((a, b) => b.citations - a.citations || a.name.localeCompare(b.name)).slice(0, 10),
  };
}

/* ═════════════════════════ a person ═════════════════════════ */

const dateOf = (d: Record<string, unknown>, ...keys: string[]): string => {
  for (const k of keys) { const v = str(d[k]); if (v) return v; }
  return '';
};

/** Money on a person's page: theirs to see, their head of department's, and the deans' and IQAC's; not a colleague's. */
function mayWatchMoney(viewer: SessionUser, person: Person): boolean {
  if (viewer.id === person.id || canSeeCollege(viewer.role)) return true;
  return viewer.role === 'hod' && !!person.departmentId && viewer.departmentId === person.departmentId;
}

async function todoFor(viewer: SessionUser, person: Person, dateOfJoining: string | null): Promise<TodoItem[]> {
  const mine = await db.select({ moduleKey: records.moduleKey, status: records.status, data: records.data })
    .from(records).where(and(eq(records.ownerUserId, viewer.id), isNull(records.deletedAt)));
  const out: TodoItem[] = [];
  if (!mine.some((r) => r.moduleKey === 'profile')) {
    out.push({ key: 'profile', label: 'Fill in your details', href: '/m/profile/new', tone: 'danger' });
  }
  const firstOf = (pick: (r: typeof mine[number]) => boolean) => {
    const hit = mine.filter(pick);
    return { n: hit.length, key: hit[0]?.moduleKey };
  };
  const returned = firstOf((r) => r.status === 'returned');
  if (returned.n > 0) {
    out.push({ key: 'returned', label: `${returned.n} ${returned.n === 1 ? 'record' : 'records'} came back to you`, href: `/m/${returned.key}?status=returned`, count: returned.n, tone: 'danger' });
  }
  if (!dateOfJoining) out.push({ key: 'joining', label: 'Ask IQAC to add your joining date', href: '/profile', tone: 'warning' });
  if (!person.orcid) out.push({ key: 'orcid', label: 'Add your ORCID iD', href: '/profile', tone: 'warning' });
  const drafts = firstOf((r) => r.status === 'draft');
  if (drafts.n > 0) {
    out.push({ key: 'drafts', label: `${drafts.n} ${drafts.n === 1 ? 'draft' : 'drafts'} to finish`, href: `/m/${drafts.key}?status=draft`, count: drafts.n, tone: 'warning' });
  }
  const answer = firstOf((r) => {
    const field = getModule(r.moduleKey)?.affiliation?.field;
    return !!field && str((r.data as Record<string, unknown>)[field]) === '';
  });
  if (answer.n > 0) {
    out.push({ key: 'answer', label: `${answer.n} ${answer.n === 1 ? 'record needs' : 'records need'} “done at BIT?”`, href: `/m/${answer.key}`, count: answer.n, tone: 'info' });
  }
  const notStarted = (await moduleStatusForUser(viewer, viewer.id, viewer.role)).filter((m) => m.progress === 'not_started');
  if (notStarted.length > 0) {
    out.push({ key: 'start', label: `${notStarted.length} ${notStarted.length === 1 ? 'module' : 'modules'} not started`, href: `/m/${notStarted[0]!.key}`, count: notStarted.length, tone: 'info' });
  }
  return out;
}

export async function personInsights(viewer: SessionUser, userId: string, range: YearRange | null): Promise<PersonInsights> {
  const [u] = await db.select({
    departmentId: users.departmentId, joining: users.dateOfJoining, scopusAuthorId: users.scopusAuthorId, researcherId: users.researcherId,
  }).from(users).where(and(eq(users.id, userId), eq(users.isActive, true))).limit(1);
  if (!u) throw new ServiceError('NOT_FOUND', 'There is no such person.');
  if (!canSeePerson(viewer, { id: userId, departmentId: u.departmentId })) throw new ServiceError('FORBIDDEN', 'You may not see this person.');
  const [person] = await loadPeople(eq(users.id, userId));
  if (!person) throw new ServiceError('NOT_FOUND', 'There is no such person.');

  const rows = await loadRows(eq(records.ownerUserId, userId));
  const ctx = await contextFor(rows, range);
  const base = summarise(rows, ctx);
  const money = mayWatchMoney(viewer, person);
  const live = dedupe(rows.filter((r) => !outside(r) && (!range || (r.periodYear >= range.from && r.periodYear <= range.to))));
  const of = (...mods: string[]) => live.filter((r) => mods.includes(r.moduleKey));

  const [profile] = await db.select({ data: records.data }).from(records)
    .where(and(eq(records.ownerUserId, userId), eq(records.moduleKey, 'profile'), isNull(records.deletedAt))).limit(1);
  const pd = (profile?.data ?? {}) as Record<string, unknown>;
  const education: PersonInsights['person']['education'] = [];
  if (str(pd.ugQualification)) education.push({ level: 'UG', degree: str(pd.ugQualification), institute: str(pd.ugInstitution) });
  if (str(pd.pgQualification)) education.push({ level: 'PG', degree: str(pd.pgQualification), institute: str(pd.pgInstitution) });
  if (str(pd.hasPhd) === 'Yes') education.push({ level: 'PhD', degree: 'PhD', institute: str(pd.phdInstitution) });
  const months = Number(pd.teachingExperienceMonths);

  const metrics = await db.select().from(researcherMetrics).where(eq(researcherMetrics.userId, userId))
    .orderBy(desc(researcherMetrics.asOf), desc(researcherMetrics.createdAt));
  const latest = (source: string) => metrics.find((m) => m.source === source) ?? null;
  const figure = (...rows: Array<typeof metrics[number] | null>) => {
    const first = rows.find((x) => x);
    if (!first) return null;
    return { citations: rows.find((x) => x?.citations != null)?.citations ?? null, hIndex: rows.find((x) => x?.hIndex != null)?.hIndex ?? null, asOf: first.asOf };
  };

  const authorsKey = (s: string) => letters(s).replace(/\s+/g, ' ').trim();
  const together = new Map<string, { name: string; papers: number }>();
  for (const r of of('publications')) {
    const seen = new Set<string>();
    for (const a of splitAuthors(str(r.data.authors))) {
      if (namesMatch(person.parts, { given: '', family: '', full: a })) continue;
      const k = authorsKey(a);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      const c = together.get(k) ?? { name: a, papers: 0 };
      c.papers += 1;
      together.set(k, c);
    }
  }

  const hide = <T extends number>(v: T): T | 0 => (money ? v : 0);
  const periodOf = (d: Record<string, unknown>) => {
    const start = str(d.sanctionDate).slice(0, 4);
    const years = Number(d.durationYears);
    return start ? (Number.isFinite(years) && years > 0 ? `${start}–${Number(start) + Math.ceil(years)}` : start) : '';
  };

  return {
    ...base,
    counts: { ...base.counts, projectFunding: hide(base.counts.projectFunding), consultancyRevenue: hide(base.counts.consultancyRevenue) },
    byYear: base.byYear.map((y) => ({ ...y, funding: hide(y.funding) })),
    funders: base.funders.map((f) => ({ ...f, amount: hide(f.amount) })),
    person: {
      userId, name: person.name, designation: person.designation, department: person.departmentName, departmentCode: person.departmentCode,
      orcid: person.orcid, scopusAuthorId: u.scopusAuthorId, researcherId: u.researcherId, joining: u.joining,
      experienceMonths: Number.isFinite(months) && str(pd.teachingExperienceMonths) !== '' ? months : null, education,
    },
    profiles: {
      scopus: figure(latest('scopus'), latest('scopus-typed')), wos: figure(latest('wos')), openalex: figure(latest('openalex')),
    },
    recentPapers: recentPapers(rows, ctx),
    awards: of(...AWARD_MODULES).map((r) => ({
      id: r.id, moduleKey: r.moduleKey, title: str(r.data.awardName), by: dateOf(r.data, 'agency', 'awardingBody'), date: dateOf(r.data, 'awardDate'),
    })).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12),
    memberships: of('outreach').filter((r) => str(r.data.activityType) === OUTREACH_TYPES.body).map((r) => ({
      id: r.id, body: str(r.data.bodyName), kind: str(r.data.bodyKind), from: str(r.data.memberFrom), to: str(r.data.memberTo),
    })).slice(0, 12),
    projects: of('grants').map((r) => ({
      id: r.id, title: str(r.data.title), role: str(r.data.role), agency: str(r.data.agency), amount: hide(moneyOf(r.data, 'amount')), period: periodOf(r.data),
    })).sort((a, b) => b.period.localeCompare(a.period)).slice(0, 12),
    theses: of('studentsguided').filter((r) => str(r.data.level) === 'PHD').map((r) => ({
      id: r.id, student: str(r.data.studentName), year: Number(r.data.yearOfPassing) || r.periodYear, status: str(r.data.statusAfterPassing),
    })).sort((a, b) => b.year - a.year).slice(0, 12),
    patents: of('patents').map((r) => ({
      id: r.id, title: str(r.data.title), status: str(r.data.status), date: dateOf(r.data, 'grantDate', 'publishedDate', 'filedDate', 'statusDate'),
      number: dateOf(r.data, 'patentNumber', 'applicationNo'),
    })).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12),
    coAuthors: [...together.values()].filter((c) => c.papers >= 2).sort((a, b) => b.papers - a.papers || a.name.localeCompare(b.name)).slice(0, 10),
    // The to-do list is for the person alone.
    todo: viewer.id === userId ? await todoFor(viewer, person, u.joining) : [],
  };
}
