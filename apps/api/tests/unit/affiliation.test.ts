import { describe, it, expect } from 'vitest';
import { affiliationFrom, firstDate, isOutsideBit } from '@darp/shared/affiliation';
import { earliestDate, fromCrossref } from '@/server/lookup/crossref';
import { MODULES } from '@darp/shared/modules';

/* Phase 7 of the decisions plan: "was this done while you were at BIT?", worked out from the joining date. */

describe('affiliationFrom', () => {
  const joined = '2015-07-14';
  it.each([
    ['2019-03-05', 'Yes', 'a day after joining'],
    ['2010-01-01', 'No', 'a day before joining'],
    ['2015-07-14', 'Yes', 'the day of joining'],
    ['2015-07-13', 'No', 'the day before joining'],
    ['2015-08', 'Yes', 'a later month of the same year'],
    ['2015-06', 'No', 'an earlier month of the same year'],
    ['2016', 'Yes', 'a later year'],
    ['2014', 'No', 'an earlier year'],
  ] as const)('%s is %s (%s)', (when, answer, _why) => {
    expect(affiliationFrom(joined, when)).toBe(answer);
  });

  it.each([
    ['2015-07', 'the month of joining, day unknown'],
    ['2015', 'the year of joining, month unknown'],
  ])('cannot tell for %s (%s), so asks', (when) => {
    expect(affiliationFrom(joined, when)).toBeNull();
  });

  it('asks when there is no joining date, no date, or a date that is not one', () => {
    expect(affiliationFrom(null, '2019-01-01')).toBeNull();
    expect(affiliationFrom('', '2019-01-01')).toBeNull();
    expect(affiliationFrom(joined, '')).toBeNull();
    expect(affiliationFrom(joined, undefined)).toBeNull();
    expect(affiliationFrom(joined, 'last spring')).toBeNull();
    expect(affiliationFrom(joined, '2019-03-05T00:00:00Z')).toBeNull();
  });
});

describe('the date a module answers from', () => {
  it('is the first of its dates that the record carries', () => {
    expect(firstDate(MODULES.patents!, { filedDate: '', statusDate: '2021-02-02' })).toBe('2021-02-02');
    expect(firstDate(MODULES.patents!, { filedDate: '2019-01-01', statusDate: '2021-02-02' })).toBe('2019-01-01');
    expect(firstDate(MODULES.consultancy!, { financialYear: '2022' })).toBe('');
  });

  it('is set where the work has a date, and left to be asked where it has not', () => {
    const dated = Object.values(MODULES).filter((m) => m.affiliation && m.affiliation.dates.length > 0).map((m) => m.key).sort();
    const asked = Object.values(MODULES).filter((m) => m.affiliation && m.affiliation.dates.length === 0).map((m) => m.key).sort();
    expect(dated).toEqual(['awards', 'books', 'econtent', 'extawards', 'fdpattended', 'fellowships', 'grants', 'outreach', 'patents', 'publications', 'riawards']);
    expect(asked).toEqual(['consultancy', 'studentsguided']);
  });

  it('is not asked in financial support, seed money, mentorship, or the offices’ own modules', () => {
    for (const key of ['finsupport', 'seedmoney', 'mentorship', 'qscontacts', 'profile', 'mous', 'fdporganised', 'workshops']) {
      expect(MODULES[key]!.affiliation).toBeUndefined();
    }
  });

  it('marks work answered No as outside BIT, and nothing else', () => {
    expect(isOutsideBit(MODULES.awards, { affiliatedToBit: 'No' })).toBe(true);
    expect(isOutsideBit(MODULES.awards, { affiliatedToBit: 'Yes' })).toBe(false);
    expect(isOutsideBit(MODULES.awards, {})).toBe(false);
    expect(isOutsideBit(MODULES.books, { sameAffiliation: 'No' })).toBe(true);
    expect(isOutsideBit(MODULES.finsupport, { affiliatedToBit: 'No' })).toBe(false);
  });
});

describe('the date a paper first appeared', () => {
  it('is the earliest of its dates, compared as far as the shorter goes, preferring the more exact', () => {
    expect(earliestDate(['2014-06', '2016', '2015-03-02'])).toBe('2014-06');
    expect(earliestDate(['2016', '2014-06'])).toBe('2014-06');
    expect(earliestDate(['2015', '2015-03-02'])).toBe('2015-03-02');
    expect(earliestDate(['2016-01-01', '2016'])).toBe('2016-01-01');
    expect(earliestDate(['', ''])).toBe('');
  });

  it('is taken from the publisher: online in 2014, in an issue in 2016, was published in 2014', () => {
    const work = {
      DOI: '10.1/x', title: ['T'], type: 'journal-article',
      'published-online': { 'date-parts': [[2014, 6]] }, 'published-print': { 'date-parts': [[2016, 1, 1]] }, issued: { 'date-parts': [[2016]] },
    } as unknown as Parameters<typeof fromCrossref>[0];
    expect(fromCrossref(work).values.publishedOn).toBe('2014-06');
    expect(fromCrossref(work).values.year).toBe('2016');            // the year that counts is still the issue's
  });
});
