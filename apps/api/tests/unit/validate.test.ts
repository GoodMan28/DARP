import { describe, it, expect, vi } from 'vitest';
import { validateRecord } from '@/server/records/validate';
import {
  buildNaturalKey, buildSearchText, prepareForStorage, presentForRead, normaliseDoi,
} from '@/server/records/prepare';
import { MODULES } from '@darp/shared/modules';

// The list keys must match the `listKey` in the module configs, or the select
// validator falls back to "no list configured" and accepts anything.
vi.mock('@/server/records/masterLists', () => ({
  getAllLists: async () => ({
    indexingTypes: ['SCIE', 'Scopus', 'ESCI', 'SSCI', 'AHCI'],
    projectRoles: ['PI', 'Co-PI'],
    agencyCategories: ['Government', 'Non-Government'],
  }),
  getList: async () => [],
  invalidateListCache: () => {},
}));

const pubs = MODULES.publications!;
const profile = MODULES.profile!;

const paper = {
  doi: '10.1016/j.future.2026.107812',
  title: 'A paper',
  authors: 'A, B',
  journal: 'FGCS',
  indexing: 'SCIE',
  year: '2024',
  issn: '0167-739X',
  bibliographic: 'A, B. "A paper." FGCS (2024).',
};

describe('field validation', () => {
  it('accepts a valid publication and rejects a bad DOI', async () => {
    const good = await validateRecord(pubs, paper, 'submit');
    expect(good.errors).toEqual({});
    expect(good.ok).toBe(true);

    const bad = await validateRecord(pubs, { ...paper, doi: 'not-a-doi' }, 'submit');
    expect(bad.ok).toBe(false);
    expect(bad.errors.doi).toMatch(/valid DOI/);
  });

  it('rejects a value that is not in the master list', async () => {
    const r = await validateRecord(pubs, { ...paper, indexing: 'MADE-UP' }, 'submit');
    expect(r.errors.indexing).toBeTruthy();
  });

  it('rejects unknown fields (JSONB injection guard)', async () => {
    const r = await validateRecord(pubs, { title: 't', isAdmin: true }, 'draft');
    expect(r.ok).toBe(false);
    expect(r.errors.isAdmin).toBe('Unknown field.');
  });

  it('allows an incomplete draft but not an incomplete submission', async () => {
    expect((await validateRecord(pubs, { title: 'Only a title' }, 'draft')).ok).toBe(true);
    expect((await validateRecord(pubs, { title: 'Only a title' }, 'submit')).ok).toBe(false);
  });

  it('accepts money only as digits, and normalises formatting', async () => {
    const grants = MODULES.grants!;
    const moneyField = grants.fields.find((f) => f.type === 'money')!;
    const r = await validateRecord(grants, { [moneyField.key]: '48,20,000' }, 'draft');
    expect(r.data[moneyField.key]).toBe('4820000');
    const bad = await validateRecord(grants, { [moneyField.key]: '48 lakh' }, 'draft');
    expect(bad.errors[moneyField.key]).toMatch(/digits only/);
  });

  it('rejects an Aadhaar that fails the checksum, and accepts one that passes', async () => {
    const bad = await validateRecord(profile, { aadhaar: '234123412345' }, 'draft');
    expect(bad.errors.aadhaar).toMatch(/valid 12-digit Aadhaar/);
    const good = await validateRecord(profile, { aadhaar: '234123412346' }, 'draft');
    expect(good.errors.aadhaar).toBeUndefined();
  });

  it('drops a conditional field whose condition is not met', async () => {
    const exams = MODULES.exams!;
    const conditional = exams.fields.find((f) => f.showIf);
    if (!conditional) return;
    const r = await validateRecord(exams, { [conditional.key]: 'should be dropped' }, 'draft');
    expect(r.data[conditional.key]).toBeUndefined();
  });
});

describe('storage preparation', () => {
  it('normalises DOI variants to one form', () => {
    expect(normaliseDoi('https://doi.org/10.1016/ABC')).toBe('10.1016/abc');
    expect(normaliseDoi('http://dx.doi.org/10.1016/ABC')).toBe('10.1016/abc');
    expect(normaliseDoi('10.1016/abc')).toBe('10.1016/abc');
  });

  it('builds a stable natural key regardless of case and URL form', () => {
    const a = buildNaturalKey(pubs, { doi: 'https://doi.org/10.1016/ABC' });
    const b = buildNaturalKey(pubs, { doi: '10.1016/abc' });
    expect(a).toBe(b);
  });

  it('returns no natural key while a key part is still blank', () => {
    expect(buildNaturalKey(pubs, {})).toBeNull();
  });

  it('scopes a department module’s natural key to its department', () => {
    const edpmdp = MODULES.edpmdp!;
    if (!edpmdp.naturalKey?.length) return;
    const values = Object.fromEntries(edpmdp.naturalKey.map((k) => [k, '2024']));
    const cse = buildNaturalKey(edpmdp, values, 'dept-cse');
    const me = buildNaturalKey(edpmdp, values, 'dept-me');
    expect(cse).not.toBe(me);   // two departments may report the same year
  });

  it('never puts encrypted or sensitive values into the search text', () => {
    const text = buildSearchText(profile, {
      name: 'Dr Verma', aadhaar: '234123412346', pan: 'ABCDE1234F',
    });
    expect(text).toContain('dr verma');
    expect(text).not.toContain('234123412346');
    expect(text).not.toContain('abcde1234f');
  });

  it('encrypts on the way in and masks on the way out', () => {
    const stored = prepareForStorage(profile, { name: 'X', aadhaar: '234123412346' });
    expect(String(stored.data.aadhaar)).toMatch(/^v1:/);
    expect(String(stored.data.aadhaar)).not.toContain('234123412346');
    const shown = presentForRead(profile, stored.data, { includeSensitive: true });
    expect(shown.aadhaar).toBe('XXXX-XXXX-2346');
  });

  it('masks an encrypted field even for the owner — plaintext never crosses the network', () => {
    const stored = prepareForStorage(profile, { aadhaar: '234123412346', pan: 'ABCDE1234F' });
    for (const includeSensitive of [true, false]) {
      const shown = presentForRead(profile, stored.data, { includeSensitive });
      expect(String(shown.aadhaar)).not.toContain('234123412346');
      expect(String(shown.pan)).not.toContain('ABCDE1234F');
    }
  });

  it('masks contact details for readers who are not the owner', () => {
    const guided = MODULES.studentsguided!;
    const masked = guided.fields.filter((f) => f.pii === 'masked');
    if (masked.length === 0) return;
    const data = Object.fromEntries(masked.map((f) => [
      f.key,
      f.type === 'email' ? 'anita.kumari@bitmesra.ac.in' : f.type === 'phone' ? '+91 9876543210' : '1250000',
    ]));
    const owner = presentForRead(guided, data, { includeSensitive: true });
    const office = presentForRead(guided, data, { includeSensitive: false });
    for (const f of masked) {
      expect(owner[f.key]).toBe(data[f.key]);
      expect(office[f.key]).not.toBe(data[f.key]);
    }
  });
});

describe('the 24 module configs are internally consistent', () => {
  const all = Object.values(MODULES);

  it('has 24 modules with unique keys', () => {
    expect(all).toHaveLength(24);
    expect(new Set(all.map((m) => m.key)).size).toBe(24);
  });

  it('gives every module unique field keys', () => {
    for (const m of all) {
      const keys = m.fields.map((f) => f.key);
      expect(new Set(keys).size, `${m.key} has duplicate field keys`).toBe(keys.length);
    }
  });

  it('points every listColumn, naturalKey, defaultSort and showIf at a real field', () => {
    for (const m of all) {
      const keys = new Set(m.fields.map((f) => f.key));
      for (const c of m.listColumns) expect(keys.has(c), `${m.key}.listColumns → ${c}`).toBe(true);
      for (const c of m.naturalKey ?? []) expect(keys.has(c), `${m.key}.naturalKey → ${c}`).toBe(true);
      if (m.defaultSort) expect(keys.has(m.defaultSort.key), `${m.key}.defaultSort`).toBe(true);
      for (const f of m.fields) {
        if (f.showIf) expect(keys.has(f.showIf.field), `${m.key}.${f.key}.showIf`).toBe(true);
      }
    }
  });

  it('never shows a sensitive field in a list column', () => {
    for (const m of all) {
      const sensitive = new Set(m.fields.filter((f) => f.sensitive || f.pii === 'encrypted').map((f) => f.key));
      for (const c of m.listColumns) {
        expect(sensitive.has(c), `${m.key} lists the protected field ${c}`).toBe(false);
      }
    }
  });

  it('gives every module at least one export target', () => {
    for (const m of all) {
      expect(m.exportTargets.length, `${m.key} exports nowhere`).toBeGreaterThan(0);
    }
  });
});
