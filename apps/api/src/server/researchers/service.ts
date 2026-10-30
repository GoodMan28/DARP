import { and, asc, desc, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { users, departments, researcherMetrics, appSettings, evidenceFiles } from '@/server/db/schema';
import type { SessionUser } from '@/server/auth/session';
import { ServiceError } from '@/server/records/service';
import { defaultRange, type YearRange } from '@/server/records/range';
import { papersForUsers } from '@/server/rollups/completion';
import { namesMatch } from '@/server/lookup/names';
import { partsOf } from '@/server/lookup/identity';
import { splitName } from '@darp/shared/names';
import { istClock } from '@/server/lookup/scopusList';
import { log } from '@/server/log';
import { FACULTY_MEMBERS } from '@darp/shared/modules/types';
import {
  DEFAULT_THRESHOLDS, RESEARCHER_ID, SCOPUS_ID, NAME_SHARE_MIN, BIT_SCOPUS_AFFILIATION_ID, qualitySignal,
  type MetricsRow, type QualityThresholds, type ResearchProfile, type ResearchQualityRow, type ScopusCheck,
} from '@darp/shared/research';
import { scopusConnected, scopusFigures, nameShare, countDocuments, ScopusUnavailable } from './scopus';
import { wosConnected, wosResearcher, WosUnavailable } from './wos';
import { openAlexByOrcid } from './openalex';
import { isLookupUnavailable } from '@/server/lookup/http';
import type { OrcidCheck } from '@darp/shared/contracts';

const THRESHOLDS_KEY = 'researchQualityThresholds';
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

/* ───────────────────────────── who may see whom ───────────────────────────── */

/** A person's research figures are seen by the person, their head of department, DRIE and IQAC. */
async function assertMaySee(actor: SessionUser, userId: string) {
  if (actor.id === userId || actor.role === 'admin' || actor.role === 'drie') return;
  if (actor.role === 'hod' && actor.departmentId) {
    const [u] = await db.select({ dept: users.departmentId }).from(users).where(eq(users.id, userId)).limit(1);
    if (u?.dept === actor.departmentId) return;
  }
  throw new ServiceError('NOT_FOUND', 'Not found.');
}

/* ───────────────────────────── thresholds ───────────────────────────── */

export async function getThresholds(): Promise<QualityThresholds> {
  const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, THRESHOLDS_KEY)).limit(1);
  return { ...DEFAULT_THRESHOLDS, ...((row?.value ?? {}) as Partial<QualityThresholds>) };
}

export async function setThresholds(actor: SessionUser, input: Partial<QualityThresholds>): Promise<QualityThresholds> {
  if (actor.role !== 'admin') throw new ServiceError('FORBIDDEN', 'Only IQAC may change the thresholds.');
  const next: QualityThresholds = { ...(await getThresholds()) };
  for (const k of Object.keys(DEFAULT_THRESHOLDS) as Array<keyof QualityThresholds>) {
    const v = input[k];
    if (v === undefined) continue;
    const pctKey = k.endsWith('Share');
    if (!Number.isFinite(v) || v < 0 || (pctKey && v > 100) || v > 100_000) {
      throw new ServiceError('VALIDATION', 'A threshold is out of range.', { [k]: pctKey ? 'Enter a percentage from 0 to 100.' : 'Enter a number of 0 or more.' });
    }
    next[k] = v;
  }
  await db.insert(appSettings).values({ key: THRESHOLDS_KEY, value: next, updatedBy: actor.id })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: next, updatedBy: actor.id, updatedAt: new Date() } });
  return next;
}

/* ───────────────────────────── figures ───────────────────────────── */

type Row = typeof researcherMetrics.$inferSelect;
const asMetrics = (r: Row): MetricsRow => ({
  source: r.source as MetricsRow['source'], asOf: r.asOf, documents: r.documents, citations: r.citations,
  citationsExclSelf: r.citationsExclSelf, hIndex: r.hIndex, hIndexExclSelf: r.hIndexExclSelf,
});

type Latest = { scopus: Row | null; wos: Row | null; openalex: Row | null };

/** The newest Scopus, WoS and OpenAlex rows of each person. */
async function latestRows(userIds: string[]): Promise<Map<string, Latest>> {
  const out = new Map<string, Latest>(userIds.map((id) => [id, { scopus: null, wos: null, openalex: null }]));
  if (userIds.length === 0) return out;
  const rows = await db.select().from(researcherMetrics)
    .where(inArray(researcherMetrics.userId, userIds))
    .orderBy(desc(researcherMetrics.asOf), desc(researcherMetrics.createdAt));
  for (const r of rows) {
    const t = out.get(r.userId)!;
    if (r.source === 'scopus' && !t.scopus) t.scopus = r;
    if (r.source === 'wos' && !t.wos) t.wos = r;
    if (r.source === 'openalex' && !t.openalex) t.openalex = r;
  }
  return out;
}

/** The ORCID iD DARP may act on: saved, found on orcid.org, and under the account's own name. */
const trusted = (orcid: string | null, check: unknown): check is OrcidCheck =>
  !!orcid && !!check && (check as OrcidCheck).found && (check as OrcidCheck).nameMatches && !(check as OrcidCheck).unchecked;

/** A person's research IDs, latest figures and signal for a range. */
export async function researchProfile(actor: SessionUser, userId: string, chosen?: YearRange): Promise<ResearchProfile> {
  await assertMaySee(actor, userId);
  const [u] = await db.select({
    name: users.name, scopusAuthorId: users.scopusAuthorId, scopusCheck: users.scopusCheck, researcherId: users.researcherId,
    orcid: users.orcid, orcidCheck: users.orcidCheck,
  }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u) throw new ServiceError('NOT_FOUND', 'Not found.');
  const range = chosen ?? await defaultRange();
  const [latest, papers, thresholds] = await Promise.all([latestRows([userId]), papersForUsers([userId], range), getThresholds()]);
  const { scopus, wos, openalex } = latest.get(userId)!;
  const p = papers.get(userId)!;
  const ext = trusted(u.orcid, u.orcidCheck) ? u.orcidCheck.externalIds : undefined;
  const wosRaw = (wos?.raw ?? {}) as { evidenceId?: string; typed?: boolean };
  return {
    userId, name: u.name,
    orcid: u.orcid, orcidTrusted: trusted(u.orcid, u.orcidCheck),
    idsFromOrcid: {
      scopusAuthorId: !!u.scopusAuthorId && !!ext?.scopusAuthorIds.includes(u.scopusAuthorId),
      researcherId: !!u.researcherId && !!ext?.researcherIds.includes(u.researcherId),
    },
    scopusAuthorId: u.scopusAuthorId, scopusCheck: (u.scopusCheck ?? null) as ScopusCheck | null, researcherId: u.researcherId,
    scopus: scopus ? asMetrics(scopus) : null,
    scopusBitDocuments: ((scopus?.raw ?? {}) as { bitDocuments?: number | null }).bitDocuments ?? null,
    wos: wos ? { ...asMetrics(wos), evidenceId: wosRaw.evidenceId ?? null, typed: !!wosRaw.typed } : null,
    openalex: openalex ? asMetrics(openalex) : null,
    signal: qualitySignal(scopus ? asMetrics(scopus) : null, wos ? asMetrics(wos) : null, p.papers, p.top, thresholds, openalex ? asMetrics(openalex) : null),
    range: { from: range.from, to: range.to },
    scopusConnected: scopusConnected(),
    wosConnected: wosConnected(),
    thresholds,
  };
}

/* ───────────────────────────── saving ───────────────────────────── */

/** Saves the person's own Scopus Author ID and ResearcherID; a new Scopus ID is checked with Elsevier. */
export async function saveResearchIds(
  actor: SessionUser, input: { scopusAuthorId?: string | null; researcherId?: string | null },
): Promise<ResearchProfile> {
  const scopus = input.scopusAuthorId === undefined ? undefined
    : (input.scopusAuthorId ?? '').replace(/\D/g, '') || null;
  const rid = input.researcherId === undefined ? undefined
    : (input.researcherId ?? '').trim().toUpperCase().replace(/^HTTPS?:\/\/\S*\//, '') || null;
  if (scopus && !SCOPUS_ID.test(scopus)) {
    throw new ServiceError('VALIDATION', 'That is not a Scopus Author ID.', {
      scopusAuthorId: 'A Scopus Author ID is 10 or 11 digits: the number after authorId= on your Scopus author page.',
    });
  }
  if (rid && !RESEARCHER_ID.test(rid)) {
    throw new ServiceError('VALIDATION', 'That is not a ResearcherID.', {
      researcherId: 'A ResearcherID looks like AAB-1234-2020: letters, four digits, four digits.',
    });
  }
  for (const [col, value, field] of [[users.scopusAuthorId, scopus, 'scopusAuthorId'], [users.researcherId, rid, 'researcherId']] as const) {
    if (!value) continue;
    const [taken] = await db.select({ id: users.id }).from(users).where(eq(col, value)).limit(1);
    if (taken && taken.id !== actor.id) {
      throw new ServiceError('VALIDATION', 'That ID is already on another account.', { [field]: 'Another DARP account already uses this ID. Ask IQAC if it is yours.' });
    }
  }

  const [before] = await db.select({ scopusAuthorId: users.scopusAuthorId }).from(users).where(eq(users.id, actor.id)).limit(1);
  const set: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
  if (scopus !== undefined) set.scopusAuthorId = scopus;
  if (rid !== undefined) set.researcherId = rid;
  if (scopus !== undefined && scopus !== before?.scopusAuthorId) set.scopusCheck = null;
  await db.update(users).set(set).where(eq(users.id, actor.id));
  if (scopus && scopus !== before?.scopusAuthorId) await refreshScopus(actor.id, { strict: true });
  return researchProfile(actor, actor.id);
}

/** Saves the Web of Science figures the person typed, with a screenshot of their WoS profile. */
export async function saveWos(
  actor: SessionUser,
  input: { documents: number; citationsExclSelf: number; hIndex: number; asOf: string; evidenceId: string },
): Promise<ResearchProfile> {
  if (wosConnected()) throw new ServiceError('VALIDATION', 'Web of Science figures are fetched automatically now; they need not be typed.');
  if (input.asOf > today()) throw new ServiceError('VALIDATION', 'The date is in the future.', { asOf: 'Use the date you read the figures.' });
  const [ev] = await db.select({ id: evidenceFiles.id }).from(evidenceFiles)
    .where(and(eq(evidenceFiles.id, input.evidenceId), eq(evidenceFiles.uploadedBy, actor.id), isNull(evidenceFiles.deletedAt))).limit(1);
  if (!ev) throw new ServiceError('VALIDATION', 'Attach a screenshot of your Web of Science profile.', { evidenceId: 'Upload the screenshot again.' });
  const values = {
    documents: input.documents, citations: null, citationsExclSelf: input.citationsExclSelf,
    hIndex: input.hIndex, hIndexExclSelf: null, raw: { evidenceId: input.evidenceId, typed: true },
  };
  await db.insert(researcherMetrics).values({ userId: actor.id, source: 'wos', asOf: input.asOf, ...values })
    .onConflictDoUpdate({ target: [researcherMetrics.userId, researcherMetrics.source, researcherMetrics.asOf], set: { ...values, createdAt: new Date() } });
  return researchProfile(actor, actor.id);
}

/**
 * Fetches a person's Scopus figures and keeps them for today. The profile's name must match the
 * account's: a stranger's ID stores nothing and says whose it is. `strict` (on saving the ID)
 * refuses an ID Scopus does not know; the nightly refresh just notes it.
 */
export async function refreshScopus(userId: string, opts: { strict?: boolean } = {}): Promise<ScopusCheck | null> {
  const [u] = await db.select({
    name: users.name, prefix: users.namePrefix, first: users.firstName, middle: users.middleName, last: users.lastName,
    scopusAuthorId: users.scopusAuthorId, orcid: users.orcid, orcidCheck: users.orcidCheck,
  }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u?.scopusAuthorId) return null;
  const checkedAt = new Date().toISOString();
  const save = async (check: ScopusCheck) => { await db.update(users).set({ scopusCheck: check }).where(eq(users.id, userId)); return check; };

  if (!scopusConnected()) return save({ checkedAt, scopusName: '', nameMatches: false, unchecked: 'no-key' });
  let figures;
  try {
    figures = await scopusFigures(u.scopusAuthorId);
  } catch (e) {
    if (!(e instanceof ScopusUnavailable) && !(e instanceof Error && e.name === 'NotEntitled')) throw e;
    log.warn('scopus refresh failed', { userId, error: (e as Error).message });
    return save({ checkedAt, scopusName: '', nameMatches: false, unchecked: 'unreachable' });
  }
  if (!figures) {
    if (opts.strict) {
      await db.update(users).set({ scopusAuthorId: null, scopusCheck: null }).where(eq(users.id, userId));
      throw new ServiceError('VALIDATION', 'Scopus has no author with that ID.', { scopusAuthorId: 'Scopus has no author with this ID. Copy it from your Scopus author page.' });
    }
    return save({ checkedAt, scopusName: '', nameMatches: false, unchecked: 'unreachable' });
  }
  const a = figures.author;
  const scopusName = a ? [a.given, a.family].filter(Boolean).join(' ') || a.indexed : '';
  const parts = partsOf(u);
  // With the profile's name, compare it. Without it (author views refused off campus), the ID counts as the
  // person's only when their trusted ORCID record lists it: ORCID already vouches for the name.
  const fromOrcid = trusted(u.orcid, u.orcidCheck) && !!u.orcidCheck.externalIds?.scopusAuthorIds.includes(u.scopusAuthorId);
  // Without the profile's name and without ORCID's word, the paper search is asked how many of the ID's
  // papers carry the person's surname and first initial.
  let share: number | undefined;
  if (!a && !fromOrcid) {
    // A name typed in one piece ("Dr Vandana Bhattacharjee") is split first, so the title is not the initial.
    const np = splitName(typeof parts === 'string' ? parts : [parts.first, parts.middle, parts.last].filter(Boolean).join(' '));
    const who = typeof parts === 'string'
      ? { surname: np.last || np.first, initial: np.first.charAt(0) }
      : { surname: parts.last || parts.first, initial: parts.first.charAt(0) };
    try { share = await nameShare(u.scopusAuthorId, who.surname, who.initial); } catch (e) {
      if (!(e instanceof ScopusUnavailable) && !(e instanceof Error && e.name === 'NotEntitled')) throw e;
      return save({ checkedAt, scopusName: '', nameMatches: false, unchecked: 'unreachable' });
    }
  }
  const nameMatches = a
    ? namesMatch(parts, { given: a.given, family: a.family, full: scopusName })
      || (!!a.indexed && namesMatch(parts, { given: '', family: '', full: a.indexed }))
    : fromOrcid || (share ?? 0) >= NAME_SHARE_MIN;
  const named = fromOrcid ? 'listed on your ORCID record'
    : share !== undefined && nameMatches ? `matched on ${Math.round(share * 100)}% of the papers` : '';
  const check: ScopusCheck = {
    checkedAt, scopusName: scopusName || (nameMatches ? named : ''), nameMatches,
    ...(share !== undefined ? { nameShare: Math.round(share * 100) / 100 } : {}),
    noCitationOverview: figures.citationsExclSelf === null,
  };
  if (!nameMatches) return save(check);   // a stranger's figures are never stored as this person's

  // How many of the papers were written at BIT (by the affiliation ID in the paper search).
  let bitDocuments: number | null = null;
  try { bitDocuments = await countDocuments(`AU-ID(${u.scopusAuthorId}) AND AF-ID(${BIT_SCOPUS_AFFILIATION_ID})`); } catch { /* optional */ }

  const values = {
    documents: figures.documents, citations: figures.citations, citationsExclSelf: figures.citationsExclSelf,
    hIndex: figures.hIndex, hIndexExclSelf: figures.hIndexExclSelf, raw: { scopusName, bitDocuments },
  };
  await db.insert(researcherMetrics).values({ userId, source: 'scopus', asOf: today(), ...values })
    .onConflictDoUpdate({ target: [researcherMetrics.userId, researcherMetrics.source, researcherMetrics.asOf], set: { ...values, createdAt: new Date() } });
  return save(check);
}

/* ─────────────────── IDs from ORCID, and every source at once ─────────────────── */

/**
 * The Scopus Author ID and ResearcherID listed on the person's ORCID record ("Other IDs") become
 * theirs, when DARP trusts the ORCID iD (found, under the account's own name) and no other account
 * already holds them. An ID typed by the person is replaced only by one ORCID lists.
 */
export async function adoptOrcidIds(userId: string): Promise<void> {
  const [u] = await db.select({
    orcid: users.orcid, orcidCheck: users.orcidCheck, scopusAuthorId: users.scopusAuthorId, researcherId: users.researcherId,
  }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u || !trusted(u.orcid, u.orcidCheck)) return;
  const ext = u.orcidCheck.externalIds;
  const free = async (col: typeof users.scopusAuthorId | typeof users.researcherId, v: string) => {
    const [taken] = await db.select({ id: users.id }).from(users).where(eq(col, v)).limit(1);
    return !taken || taken.id === userId;
  };
  const set: Partial<typeof users.$inferInsert> = {};
  const scopus = ext?.scopusAuthorIds[0];
  if (scopus && scopus !== u.scopusAuthorId && await free(users.scopusAuthorId, scopus)) { set.scopusAuthorId = scopus; set.scopusCheck = null; }
  const rid = ext?.researcherIds[0];
  if (rid && rid !== u.researcherId && await free(users.researcherId, rid)) set.researcherId = rid;
  if (Object.keys(set).length) await db.update(users).set({ ...set, updatedAt: new Date() }).where(eq(users.id, userId));
}

/** When the ORCID iD is removed, the IDs that came from its record go with it. */
export async function dropOrcidIds(userId: string): Promise<void> {
  const [u] = await db.select({ orcidCheck: users.orcidCheck, scopusAuthorId: users.scopusAuthorId, researcherId: users.researcherId })
    .from(users).where(eq(users.id, userId)).limit(1);
  const ext = (u?.orcidCheck as OrcidCheck | null)?.externalIds;
  if (!u || !ext) return;
  const set: Partial<typeof users.$inferInsert> = {};
  if (u.scopusAuthorId && ext.scopusAuthorIds.includes(u.scopusAuthorId)) { set.scopusAuthorId = null; set.scopusCheck = null; }
  if (u.researcherId && ext.researcherIds.includes(u.researcherId)) set.researcherId = null;
  if (Object.keys(set).length) await db.update(users).set(set).where(eq(users.id, userId));
}

async function keep(userId: string, source: 'wos' | 'openalex', v: { documents: number | null; citations: number | null; citationsExclSelf: number | null; hIndex: number | null }, raw: object) {
  const values = { ...v, hIndexExclSelf: null, raw };
  await db.insert(researcherMetrics).values({ userId, source, asOf: today(), ...values })
    .onConflictDoUpdate({ target: [researcherMetrics.userId, researcherMetrics.source, researcherMetrics.asOf], set: { ...values, createdAt: new Date() } });
}

/** OpenAlex's figures, found by the person's ORCID iD (free; no key). Only for an ORCID iD DARP trusts. */
export async function refreshOpenAlex(userId: string): Promise<void> {
  const [u] = await db.select({ orcid: users.orcid, orcidCheck: users.orcidCheck }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u || !trusted(u.orcid, u.orcidCheck)) return;
  try {
    const a = await openAlexByOrcid(u.orcid!);
    if (a) await keep(userId, 'openalex', { documents: a.documents, citations: a.citations, citationsExclSelf: null, hIndex: a.hIndex }, { openalexId: a.openalexId, name: a.name });
  } catch (e) {
    if (!isLookupUnavailable(e)) throw e;
    log.warn('openalex refresh failed', { userId });
  }
}

/**
 * Web of Science's figures for the ResearcherID, once Clarivate's key is set. The profile must be
 * the person's: its ORCID iDs include theirs, or its name is theirs. Otherwise nothing is kept.
 */
export async function refreshWos(userId: string): Promise<void> {
  if (!wosConnected()) return;
  const [u] = await db.select({
    name: users.name, prefix: users.namePrefix, first: users.firstName, middle: users.middleName, last: users.lastName,
    orcid: users.orcid, researcherId: users.researcherId, scopusCheck: users.scopusCheck,
  }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u?.researcherId) return;
  const checkedAt = new Date().toISOString();
  const note = async (wos: NonNullable<ScopusCheck['wos']>) => {
    const prev = (u.scopusCheck ?? { checkedAt, scopusName: '', nameMatches: false }) as ScopusCheck;
    await db.update(users).set({ scopusCheck: { ...prev, wos } }).where(eq(users.id, userId));
  };
  let r;
  try { r = await wosResearcher(u.researcherId); } catch (e) {
    if (!(e instanceof WosUnavailable)) throw e;
    return note({ checkedAt, wosName: '', nameMatches: false, unchecked: 'unreachable' });
  }
  if (!r) return note({ checkedAt, wosName: '', nameMatches: false, unchecked: 'not-found' });
  const nameMatches = (!!u.orcid && r.orcids.includes(u.orcid))
    || namesMatch(partsOf(u), { given: r.firstName, family: r.lastName, full: r.fullName });
  await note({ checkedAt, wosName: r.fullName, nameMatches });
  if (nameMatches) {
    await keep(userId, 'wos', { documents: r.documents, citations: r.citations, citationsExclSelf: r.citationsExclSelf, hIndex: r.hIndex }, { wosName: r.fullName });
  }
}

/**
 * Everything for one person, each source on its own (one failing does not stop the others): the IDs
 * from ORCID, then OpenAlex (by ORCID iD), Scopus (by Scopus Author ID) and Web of Science (by ResearcherID).
 */
export async function refreshResearcher(userId: string): Promise<void> {
  for (const step of [adoptOrcidIds, refreshOpenAlex, (id: string) => refreshScopus(id).then(() => undefined), refreshWos]) {
    try { await step(userId); } catch (e) { log.warn('researcher refresh step failed', { userId, error: String(e) }); }
  }
}

/** "Refresh now": the person themself, or IQAC for anyone. */
export async function refreshNow(actor: SessionUser, userId: string): Promise<ResearchProfile> {
  if (actor.id !== userId && actor.role !== 'admin') throw new ServiceError('FORBIDDEN', 'Only IQAC may refresh someone else’s figures.');
  await refreshResearcher(userId);
  return researchProfile(actor, userId);
}

/* ───────────────────────────── IQAC's table ───────────────────────────── */

/**
 * "Research quality": every faculty member's figures and signal. IQAC and DRIE see everyone (or the
 * departments chosen); a head of department their own department.
 */
export async function researchQuality(
  actor: SessionUser, chosen: YearRange | null, departmentIds: string[] | null,
): Promise<{ rows: ResearchQualityRow[]; range: YearRange; thresholds: QualityThresholds; scopusConnected: boolean; wosConnected: boolean }> {
  if (!['admin', 'drie', 'hod'].includes(actor.role)) throw new ServiceError('FORBIDDEN', 'This table is for IQAC, DRIE and heads of department.');
  const range = chosen ?? await defaultRange();
  const depts = actor.role === 'hod' ? (actor.departmentId ? [actor.departmentId] : ['00000000-0000-0000-0000-000000000000']) : departmentIds;
  const people = await db.select({
    id: users.id, name: users.name, department: departments.name,
    scopusAuthorId: users.scopusAuthorId, researcherId: users.researcherId, orcid: users.orcid,
  }).from(users)
    .leftJoin(departments, eq(departments.id, users.departmentId))
    .where(and(
      inArray(users.role, FACULTY_MEMBERS), eq(users.isActive, true),
      depts?.length ? inArray(users.departmentId, depts) : undefined,
    ))
    .orderBy(asc(users.name));
  const ids = people.map((p) => p.id);
  const [latest, papers, thresholds] = await Promise.all([latestRows(ids), papersForUsers(ids, range), getThresholds()]);
  const rows = people.map((p) => {
    const { scopus, wos, openalex } = latest.get(p.id)!;
    const pp = papers.get(p.id)!;
    return {
      userId: p.id, name: p.name, department: p.department ?? '',
      scopusAuthorId: p.scopusAuthorId, researcherId: p.researcherId, orcid: p.orcid,
      scopusAsOf: scopus?.asOf ?? null, wosAsOf: wos?.asOf ?? null,
      scopus: scopus ? asMetrics(scopus) : null, wos: wos ? asMetrics(wos) : null, openalex: openalex ? asMetrics(openalex) : null,
      signal: qualitySignal(scopus ? asMetrics(scopus) : null, wos ? asMetrics(wos) : null, pp.papers, pp.top, thresholds, openalex ? asMetrics(openalex) : null),
    };
  });
  return { rows, range, thresholds, scopusConnected: scopusConnected(), wosConnected: wosConnected() };
}

/* ───────────────────────────── nightly refresh ───────────────────────────── */

/** 04:00 India time, after the Scopus list (02:00) and the patent journal (03:00). */
export const RESEARCH_HOUR_IST = 4;
let lastRunDay: string | null = null;

/**
 * About a thirtieth of the people with an ORCID iD, a Scopus Author ID or a ResearcherID each night,
 * those refreshed longest ago first, so everyone is refreshed once a month within the sources' quotas.
 */
export async function refreshSomeResearchers(now = new Date()): Promise<number> {
  const people = await db.select({ id: users.id }).from(users)
    .where(and(eq(users.isActive, true), or(isNotNull(users.orcid), isNotNull(users.scopusAuthorId), isNotNull(users.researcherId))));
  if (people.length === 0) return 0;
  const last = await db.select({ userId: researcherMetrics.userId, at: sql<string>`max(${researcherMetrics.createdAt})` })
    .from(researcherMetrics).groupBy(researcherMetrics.userId);
  const at = new Map(last.map((l) => [l.userId, new Date(l.at).getTime()]));
  const due = [...people].sort((a, b) => (at.get(a.id) ?? 0) - (at.get(b.id) ?? 0)).slice(0, Math.ceil(people.length / 30));
  for (const p of due) await refreshResearcher(p.id);
  log.info('researcher refresh', { refreshed: due.length, of: people.length, at: now.toISOString() });
  return due.length;
}

export function scheduleResearcherRefresh(): NodeJS.Timeout {
  const timer = setInterval(() => {
    const clock = istClock(new Date());
    if (clock.hour !== RESEARCH_HOUR_IST || lastRunDay === clock.day) return;
    lastRunDay = clock.day;
    void refreshSomeResearchers().catch((e) => log.warn('scopus nightly refresh failed', { error: String(e) }));
  }, 10 * 60_000);
  timer.unref();
  return timer;
}
