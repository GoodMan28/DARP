import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { truncateAll, closeDb } from '../helpers/db';
import { makeUser } from '../helpers/factories';
import { createRecord, getRecord, listRecords } from '@/server/records/service';
import { uploadEvidence } from '@/server/evidence/service';
import { startBulkImport, getBulkImport, attachBulkEvidence, submitBulk } from '@/server/records/bulk';
import { notFound, type LookupResult } from '@/server/lookup/types';
import type { BulkImport } from '@darp/shared/contracts';
import type { SessionUser } from '@/server/auth/session';

/* Phase 6: a file of DOIs becomes drafts, which are completed with evidence and submitted together. */

vi.hoisted(() => { process.env.BULK_PAUSE_MS = '0'; });

// The register is faked, as in lookup.test.ts: no live Crossref in tests.
const answers = new Map<string, LookupResult>();
vi.mock('@/server/lookup/resolve', () => ({
  resolve: async (_kind: string, raw: string) => answers.get(raw.toLowerCase().replace(/^https?:\/\/doi\.org\//, '')) ?? notFound(),
  lookupKey: (_kind: string, raw: string) => raw,
}));

let faculty: SessionUser;
let other: SessionUser;

function paper(owner: string, title: string, over: Partial<LookupResult> = {}): LookupResult {
  const [given = 'Test', family = 'Faculty'] = owner.split(' ');
  return {
    found: true, source: 'crossref', authoritative: true, rawType: 'journal-article',
    values: {
      title, authors: `${owner}, Someone Else`, containerTitle: 'Real Journal', issn: '2168-7161', year: '2023',
      volume: '12', pages: '1-10', workType: 'Journal article',
    },
    people: [
      { given, family, full: owner, orcid: null, bitAffiliated: true },
      { given: 'Someone', family: 'Else', full: 'Someone Else', orcid: null, bitAffiliated: null },
    ],
    identifiers: { issn: ['2168-7161'], isbn: [] }, flags: [], fetchedAt: new Date().toISOString(),
    ...over,
  };
}

const PDF = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n');
const evidence = async (recordId: string) => (await uploadEvidence(faculty, {
  bytes: PDF, fileName: 'first-page.pdf', declaredMime: 'application/pdf', fieldKey: 'evidence', moduleKey: 'publications', recordId,
})).id;

async function finished(id: string, actor = faculty): Promise<BulkImport> {
  for (let i = 0; i < 100; i += 1) {
    const b = await getBulkImport(actor, 'publications', id);
    if (b.status !== 'running') return b;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('the upload did not finish');
}

beforeAll(async () => {
  await truncateAll();
  faculty = await makeUser({ role: 'faculty', dept: 'CSE' });
  other = await makeUser({ role: 'faculty', dept: 'CSE' });
  answers.set('10.5555/mine-1', paper(faculty.name, 'Mine one'));
  answers.set('10.5555/mine-2', paper(faculty.name, 'Mine two'));
  answers.set('10.5555/theirs', paper('Zed Nobody', 'Not mine'));
  answers.set('10.5555/conference', paper(faculty.name, 'A talk', { rawType: 'proceedings-article', values: { title: 'A talk', bookType: 'Conference paper', chapterTitle: 'A talk', bookTitle: 'Proceedings of a meeting', workType: 'Conference paper' } }));
  answers.set('10.5555/already', paper(faculty.name, 'Added before'));
});

afterAll(async () => { await closeDb(); });

describe('adding many papers from a file', () => {
  let upload: BulkImport;

  it('makes a draft of every line not already recorded, and says what the check found', async () => {
    const before = await createRecord(faculty, 'publications', { doi: '10.5555/already' }, 'draft');
    const file = [
      'DOI', '10.5555/mine-1', 'https://doi.org/10.5555/MINE-1', '10.5555/mine-2', '10.5555/theirs',
      '10.5555/missing', '10.5555/conference', '10.5555/already',
    ].join('\n');
    const started = await startBulkImport(faculty, 'publications', 'my papers.txt', Buffer.from(file));
    expect(started.total).toBe(6);                       // the repeated line is counted once

    upload = await finished(started.id);
    expect(upload.status).toBe('done');
    expect(upload.done).toBe(6);
    const byRaw = Object.fromEntries(upload.items.map((i) => [i.raw, i]));
    expect(byRaw['10.5555/mine-1']).toMatchObject({ status: 'created', record: { title: 'Mine one', status: 'draft', needsEvidence: true, evidenceId: null } });
    expect(byRaw['10.5555/mine-2']!.status).toBe('created');
    // The faculty member is trusted: a draft is made anyway, with what the check found beside it.
    expect(byRaw['10.5555/theirs']).toMatchObject({
      status: 'not-yours', record: { title: 'Not mine', status: 'draft', moduleKey: 'publications' }, message: expect.stringContaining('add your name'),
    });
    expect(byRaw['10.5555/missing']).toMatchObject({ status: 'not-found', record: { status: 'draft', title: '' } });
    // A conference paper uploaded to Publications: its draft is under Books, Chapters & Conference Papers.
    expect(byRaw['10.5555/conference']).toMatchObject({
      status: 'wrong-module', message: expect.stringContaining('The draft was made under Books, Chapters & Conference Papers'),
      record: { moduleKey: 'books', title: 'A talk', status: 'draft', evidence: { fieldKey: 'evidence' } },
    });
    expect(byRaw['10.5555/already']).toMatchObject({ status: 'exists', record: { id: before.id, mine: true } });

    // The drafts are ordinary drafts, filled and locked from the register.
    const drafts = (await listRecords(faculty, 'publications', {})).rows.filter((r) => r.status === 'draft');
    expect(drafts).toHaveLength(5);         // mine-1, mine-2, theirs, missing, and the one added before
    expect((await listRecords(faculty, 'books', {})).rows.map((r) => r.id)).toContain(byRaw['10.5555/conference']!.record!.id);
    const read = await getRecord(faculty, 'publications', byRaw['10.5555/mine-1']!.record!.id);
    expect(read.data).toMatchObject({ title: 'Mine one', journal: 'Real Journal', year: 2023 });
    expect(read.lockedFields).toContain('title');
  });

  it('submits the chosen drafts one by one: one without evidence is refused, the other approved', async () => {
    const [one, two] = upload.items.filter((i) => i.status === 'created').map((i) => i.record!.id);
    await attachBulkEvidence(faculty, 'publications', upload.id, two!, await evidence(two!));
    const results = await submitBulk(faculty, 'publications', upload.id, [one!, two!]);
    expect(results.find((r) => r.recordId === one)).toMatchObject({ ok: false, message: expect.stringMatching(/evidence/i) });
    expect(results.find((r) => r.recordId === two)).toMatchObject({ ok: true, status: 'approved' });

    const again = await getBulkImport(faculty, 'publications', upload.id);
    expect(again.items.find((i) => i.record?.id === two)!.record).toMatchObject({ status: 'approved', evidenceId: expect.any(String) });
    expect(again.items.find((i) => i.record?.id === one)!.record!.status).toBe('draft');
  });

  it('submits a draft made in the other module, and asks for the name on one without it', async () => {
    const byRaw = Object.fromEntries(upload.items.map((i) => [i.raw, i]));
    const talk = byRaw['10.5555/conference']!.record!.id;
    const theirs = byRaw['10.5555/theirs']!.record!.id;
    await attachBulkEvidence(faculty, 'publications', upload.id, theirs, await evidence(theirs));
    const results = await submitBulk(faculty, 'publications', upload.id, [talk, theirs]);
    // Books needs more than a DOI (here, the type of work): it says so on its own row.
    expect(results.find((r) => r.recordId === talk)).toMatchObject({ ok: false, message: expect.any(String) });
    expect(results.find((r) => r.recordId === theirs)).toMatchObject({ ok: false, message: expect.stringContaining('must be in the author list') });
  });

  it('keeps an upload to its owner, and its endpoints to its own drafts', async () => {
    await expect(getBulkImport(other, 'publications', upload.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const stranger = await createRecord(faculty, 'publications', { doi: '10.5555/unrelated' }, 'draft');
    const [result] = await submitBulk(faculty, 'publications', upload.id, [stranger.id]);
    expect(result).toMatchObject({ ok: false, message: 'That record is not part of this upload.' });
  });

  it('refuses a file with more than 100, and a module without a lookup', async () => {
    const many = Array.from({ length: 101 }, (_, i) => `10.5555/bulk-${i}`).join('\n');
    await expect(startBulkImport(faculty, 'publications', 'many.txt', Buffer.from(many)))
      .rejects.toMatchObject({ code: 'VALIDATION', message: expect.stringContaining('at most 100') });
    await expect(startBulkImport(faculty, 'awards', 'a.txt', Buffer.from('10.5555/x')))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
