import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { truncateAll, closeDb, db } from '../helpers/db';
import { makeUser } from '../helpers/factories';
import { createRecord, updateRecord, getRecord, listRecords } from '@/server/records/service';
import { counterValuesFor } from '@/server/rollups/completion';
import { records } from '@/server/db/schema';
import type { SessionUser } from '@/server/auth/session';

/* Phase 5: an award's date and validity, the "Valid until" column, and the awards still valid today. */

let faculty: SessionUser;

const award = (tag: string, extra: Record<string, unknown> = {}) => ({
  awardDate: '2025-03-15', awardName: `Award ${tag}`, level: 'National', agency: 'DST', validityYears: '3', ...extra,
});

beforeAll(async () => {
  await truncateAll();
  faculty = await makeUser({ role: 'faculty', dept: 'CSE' });
});

afterAll(async () => { await closeDb(); });

describe('award validity', () => {
  it('asks for the number of years unless the award is for life', async () => {
    const { validityYears: _, ...without } = award('none');
    await expect(createRecord(faculty, 'awards', without, 'submit'))
      .rejects.toMatchObject({ fields: { validityYears: expect.any(String) } });
    await expect(createRecord(faculty, 'awards', award('text', { validityYears: '7 years' }), 'submit'))
      .rejects.toMatchObject({ fields: { validityYears: expect.any(String) } });
    // Ticked "Valid for life": no years needed, and any typed are not kept.
    const life = await createRecord(faculty, 'awards', award('life', { validForLife: true }), 'submit');
    const read = await getRecord(faculty, 'awards', life.id);
    expect(read.data.validityYears).toBeUndefined();
    expect(read.derived.validUntil).toBe('Lifetime');
    // Any number of years.
    const five = await createRecord(faculty, 'extawards', {
      activityName: 'NSS camp', awardName: 'Five', awardingBody: 'Govt of Jharkhand', awardDate: '2024-03-15', validityYears: '5',
    }, 'submit');
    expect((await getRecord(faculty, 'extawards', five.id)).derived.validUntil).toBe('14-03-2029');
  });

  it('shows when it ends, or Lifetime', async () => {
    const dated = await createRecord(faculty, 'awards', award('three'), 'submit');
    expect((await getRecord(faculty, 'awards', dated.id)).derived.validUntil).toBe('14-03-2028');
    const life = await createRecord(faculty, 'riawards', {
      awardeeName: 'A. K. Verma', awardName: 'Life', awardingBody: 'INAE', awardCategory: 'Innovation',
      awardDate: '2010-01-05', awardeeCategory: 'Teacher', validForLife: true,
    }, 'submit');
    expect((await getRecord(faculty, 'riawards', life.id)).derived.validUntil).toBe('Lifetime');
  });

  it('keeps an old record without a validity, says so, and asks for it at the next edit', async () => {
    const { id } = await createRecord(faculty, 'awards', award('old', { awardDate: '2021-06-01', validityYears: '1' }), 'submit');
    // As saved before validity was asked for.
    await db.update(records).set({ data: sql`${records.data} - 'validityYears' - 'validForLife'` }).where(eq(records.id, id));

    const row = (await listRecords(faculty, 'awards', {})).rows.find((r) => r.id === id)!;
    expect(row.derived.validUntil).toBe('Validity not given');

    const values = await counterValuesFor(faculty, faculty.id, { from: 2021, to: 2021 });
    const value = (key: string) => values.computed.find((c) => c.key === key)?.value;
    expect(value('awards.count.cycle')).toBe(1);          // still counted under its year
    expect(value('awards.count.active')).toBe(2);         // "Award three" (to 2028) and "Award life"

    const { validityYears: _, ...data } = award('old', { awardDate: '2021-06-01' });
    await expect(updateRecord(faculty, 'awards', id, data, 'submit'))
      .rejects.toMatchObject({ fields: { validityYears: expect.any(String) } });
  });
});
