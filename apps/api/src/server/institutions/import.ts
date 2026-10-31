import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { institutions } from '@/server/db/schema';
import { HOME_INSTITUTE, normInstitution, shortForms } from '@darp/shared/institutions';

/*
 * Loads the institute directory from the two public sources: AISHE (India's government directory,
 * with codes like U-0202) and ROR (the world's research organisations). Indian ROR entries that are
 * the same institute as an AISHE one are merged into it, so one institute is one entry.
 */

export interface AisheRow { code: string; name: string; state: string; district: string }
export interface RorRow {
  /** 028vtqb15 */
  id: string;
  name: string;
  /** Other names, for searching only. */
  aliases: string[];
  /** The names that are one name each (labels), for matching an AISHE entry. */
  labels: string[];
  city: string;
  state: string;
  country: string;
  countryCode: string;
  types: string;
  website: string;
}
export type NewInstitution = typeof institutions.$inferInsert;

const AISHE_CODE = /^[UCSR]-\d+$/;
const KIND: Record<string, string> = { U: 'university', C: 'college', S: 'standalone', R: 'research' };

/** "Ranchi University, Ranchi" → "Ranchi University": AISHE adds the place, ROR does not. */
function withoutPlace(name: string, district: string, state: string): string | null {
  const m = name.match(/^(.*\S),\s*([^,]+)$/);
  if (!m) return null;
  const place = normInstitution(m[2]!);
  return place && [district, state].some((p) => p && normInstitution(p) === place) ? m[1]!.trim() : null;
}

const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];
const searchTextOf = (name: string, code: string, aliases: string[]) => normInstitution([name, code, ...aliases].join(' '));

/** Reads one row of the AISHE list; the npm package and the portal name the columns differently. */
export function aisheRowOf(r: Record<string, unknown>): AisheRow | null {
  const get = (...keys: string[]) => {
    for (const k of Object.keys(r)) if (keys.includes(k.toLowerCase().replace(/[\s_]+/g, ''))) return String(r[k] ?? '').trim();
    return '';
  };
  const code = get('aishecode', 'code').toUpperCase();
  const name = get('name', 'institutename', 'institutionname', 'nameofinstitute');
  if (!AISHE_CODE.test(code) || !name) return null;
  return { code, name, state: get('state', 'statename'), district: get('district', 'districtname') };
}

/** One ROR row of the data dump CSV; null for an entry that is not active. */
export function rorRowOf(r: Record<string, string>): RorRow | null {
  if (r.status !== 'active') return null;
  const id = (r.id ?? '').replace(/^https?:\/\/ror\.org\//, '');
  const name = (r['names.types.ror_display'] ?? '').trim();
  if (!id || !name) return null;
  // "en: Name (X); de: Name (Y)": one name per language, so each group is kept whole.
  const groups = (cell: string) => (cell ?? '').split(/;\s+/).map((g) => g.replace(/^[A-Za-z_]+:\s*/, '').trim()).filter(Boolean);
  const labels = groups(r['names.types.label'] ?? '');
  // Aliases and acronyms are comma lists whose members may hold commas themselves: used as search text only.
  const aliases = [...groups(r['names.types.alias'] ?? ''), ...groups(r['names.types.acronym'] ?? '')];
  return {
    id, name, aliases, labels,
    city: r['locations.geonames_details.name'] ?? '',
    state: r['locations.geonames_details.country_subdivision_name'] ?? '',
    country: r['locations.geonames_details.country_name'] ?? '',
    countryCode: r['locations.geonames_details.country_code'] ?? '',
    types: (r.types ?? '').replace(/;\s*/g, ', '),
    website: r['links.type.website'] ?? '',
  };
}

/** BIT Mesra, whatever the files say: its name as people write it, and its ROR id. */
const BIT = {
  name: 'Birla Institute of Technology, Mesra',
  aliases: [
    'BIT Mesra', 'B.I.T. Mesra', 'BIT Ranchi', 'BIT, Mesra', 'Birla Institute of Technology Ranchi',
    'Birla Institute of Technology, Ranchi', 'Birla Institute of Technology Mesra Ranchi', 'Birla Institute of Technology, Mesra, Ranchi',
  ],
  rorId: '028vtqb15',
};

/** Builds every entry from the two sources: AISHE first, then ROR merged into it or added beside it. */
export function buildEntries(aishe: AisheRow[], ror: Iterable<RorRow>, version: string): Map<string, NewInstitution> {
  return buildDirectory(aishe, ror, version).entries;
}

/**
 * The entries, and the ROR codes now folded into an AISHE entry (ROR-xxx → U-nnnn): an earlier load
 * may have kept one of them as an entry of its own.
 */
export function buildDirectory(aishe: AisheRow[], ror: Iterable<RorRow>, version: string) {
  const entries = new Map<string, NewInstitution>();
  const absorbed = new Map<string, string>();
  const names = new Map<string, Set<string>>();               // normalised name → AISHE codes
  const remember = (norm: string, code: string) => {
    if (!norm) return;
    if (!names.has(norm)) names.set(norm, new Set());
    names.get(norm)!.add(code);
  };

  // AISHE lists some institutes twice, spelled differently: one entry, the other spelling an alias.
  const byCode = new Map<string, AisheRow[]>();
  for (const r of aishe) byCode.set(r.code, [...(byCode.get(r.code) ?? []), r]);
  for (const [code, rows] of byCode) {
    const first = rows[0]!;
    const other = uniq(rows.slice(1).map((r) => r.name)).filter((n) => normInstitution(n) !== normInstitution(first.name));
    const aliases = uniq([...other, ...shortForms(first.name), ...other.flatMap(shortForms)]);
    entries.set(code, {
      code, scheme: 'aishe', name: first.name, aliases,
      city: rows.find((r) => r.district)?.district || null, state: rows.find((r) => r.state)?.state || null,
      country: 'India', countryCode: 'IN', kind: KIND[code[0]!] ?? null, rorId: null, website: null,
      searchText: searchTextOf(first.name, code, aliases), sourceVersion: version,
    });
    remember(normInstitution(first.name), code);
    for (const a of other) remember(normInstitution(a), code);
    for (const n of [first.name, ...other]) {
      const bare = withoutPlace(n, first.district, first.state);
      if (bare) remember(normInstitution(bare), code);
    }
  }

  for (const r of ror) {
    const rorCode = `ROR-${r.id}`;
    if (r.countryCode === 'IN') {
      const found = new Set<string>();
      for (const n of [r.name, ...r.labels]) for (const c of names.get(normInstitution(n)) ?? []) found.add(c);
      // The same institute only when the state does not disagree.
      const fits = [...found].filter((c) => {
        const s = entries.get(c)?.state;
        return !s || !r.state || normInstitution(s) === normInstitution(r.state);
      });
      if (fits.length === 1) {
        const e = entries.get(fits[0]!)!;
        const aliases = uniq([...(e.aliases ?? []), r.name, ...r.labels, ...r.aliases, ...shortForms(r.name)])
          .filter((a) => normInstitution(a) !== normInstitution(e.name));
        absorbed.set(rorCode, e.code);
        entries.set(e.code, { ...e, aliases, rorId: r.id, website: e.website || r.website || null, searchText: searchTextOf(e.name, e.code, aliases) });
        continue;
      }
    }
    const aliases = uniq([...r.labels, ...r.aliases, ...shortForms(r.name)]).filter((a) => normInstitution(a) !== normInstitution(r.name));
    entries.set(rorCode, {
      code: rorCode, scheme: 'ror', name: r.name, aliases,
      city: r.city || null, state: r.state || null, country: r.country || 'Unknown', countryCode: r.countryCode || null,
      kind: r.types || null, rorId: r.id, website: r.website || null,
      searchText: searchTextOf(r.name, rorCode, aliases), sourceVersion: version,
    });
  }

  // BIT Mesra: named as people write it, and one entry (not an AISHE one and a ROR one).
  const home = entries.get(HOME_INSTITUTE);
  const aliases = uniq([...BIT.aliases, ...(home?.aliases ?? []), ...(home && normInstitution(home.name) !== normInstitution(BIT.name) ? [home.name] : [])]);
  entries.delete(`ROR-${BIT.rorId}`);
  absorbed.set(`ROR-${BIT.rorId}`, HOME_INSTITUTE);
  entries.set(HOME_INSTITUTE, {
    code: HOME_INSTITUTE, scheme: 'aishe', name: BIT.name, aliases, city: home?.city || 'Ranchi', state: home?.state || 'Jharkhand',
    country: 'India', countryCode: 'IN', kind: 'university', rorId: BIT.rorId, website: home?.website || 'https://www.bitmesra.ac.in',
    searchText: searchTextOf(BIT.name, HOME_INSTITUTE, aliases), sourceVersion: version,
  });
  return { entries, absorbed };
}

/** An earlier load's stand-alone ROR entry is now part of an AISHE one: it is marked merged, never deleted. */
export async function markAbsorbed(absorbed: Map<string, string>): Promise<number> {
  let n = 0;
  for (const [rorCode, into] of absorbed) {
    const done = await db.update(institutions).set({ status: 'merged', mergedInto: into, updatedAt: new Date() })
      .where(and(eq(institutions.code, rorCode), eq(institutions.scheme, 'ror'), eq(institutions.status, 'active')))
      .returning({ code: institutions.code });
    n += done.length;
  }
  return n;
}

/** Writes entries in batches. A reload updates names and aliases but never a reviewed entry's status. */
export async function storeInstitutions(entries: Iterable<NewInstitution>, batch = 1000): Promise<number> {
  let n = 0;
  let chunk: NewInstitution[] = [];
  const flush = async () => {
    if (chunk.length === 0) return;
    await db.insert(institutions).values(chunk).onConflictDoUpdate({
      target: institutions.code,
      set: {
        name: sql`excluded.name`, aliases: sql`excluded.aliases`, city: sql`excluded.city`, state: sql`excluded.state`,
        country: sql`excluded.country`, countryCode: sql`excluded.country_code`, kind: sql`excluded.kind`, rorId: sql`excluded.ror_id`,
        website: sql`excluded.website`, searchText: sql`excluded.search_text`, sourceVersion: sql`excluded.source_version`,
        updatedAt: sql`now()`,
      },
    });
    n += chunk.length;
    chunk = [];
  };
  for (const e of entries) {
    chunk.push(e);
    if (chunk.length >= batch) await flush();
  }
  await flush();
  return n;
}
