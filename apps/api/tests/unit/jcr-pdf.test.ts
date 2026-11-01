import { describe, it, expect } from 'vitest';
import { linesToRows } from '@/server/lookup/jcrPdf';
import { journalTitleKey } from '@darp/shared/journals';
import type { TextItem } from '@/server/lookup/patentJournal';

/* The Journal Citation Reports PDF: the columns are read by their place on the page. */

const word = (x: number, y: number, s: string): TextItem => ({ x, y, w: 10, s });
/** One printed line: the name's words from x = 57, then the three figures at their columns. */
const row = (y: number, name: string, jif: string, five: string, q: string): TextItem[] => [
  ...name.split(' ').map((w, i) => word(57 + i * 40, y, w)),
  word(384, y, jif), word(439, y, five), word(491, y, q),
];
const header = (y: number, year = '2024'): TextItem[] => [
  word(182, y, 'Journal'), word(230, y, 'Name'), word(385, y, 'JIF'), word(409, y, year), word(445, y, '5-Year'), word(498, y, 'Q'),
];
/** Enough filler for the file to look like a real list (a short one is refused). */
const filler = (n: number): TextItem[][] => Array.from({ length: Math.ceil(n / 50) }, (_, p) => (
  Array.from({ length: 50 }, (_, i) => row(100 + i * 14, `Filler Journal ${p * 50 + i}`, '1.1', '1.2', 'Q3')).flat()
));

describe('reading the list', () => {
  it('reads the name, the JIF and the quartile of each journal, and the year from the heading', () => {
    const pdf = linesToRows([[...header(75), ...row(89, 'NATURE REVIEWS DRUG DISCOVERY', '103.3', '99.1', 'Q1')], ...filler(1100)]);
    expect(pdf.jifYear).toBe(2024);
    expect(pdf.journals.find((j) => j.name === 'NATURE REVIEWS DRUG DISCOVERY')).toEqual({ name: 'NATURE REVIEWS DRUG DISCOVERY', jif: '103.3', quartile: 'Q1' });
  });

  it('keeps a journal that appears under several categories once', () => {
    const pdf = linesToRows([[...header(75), ...row(89, 'LANCET', '88.5', '104.8', 'Q1'), ...row(103, 'LANCET', '88.5', '104.8', 'Q1')], ...filler(1100)]);
    expect(pdf.journals.filter((j) => j.name === 'LANCET')).toHaveLength(1);
    expect(pdf.rows).toBe(1102);                           // both lines were read
  });

  it('reads a "<0.1" figure, an N/A Impact Factor and an N/A quartile', () => {
    const pdf = linesToRows([[...header(75), ...row(89, 'Akustika', '0.2', '<0.1', 'Q4'), ...row(103, 'Old Journal', 'N/A', '0.5', 'N/A'), ...row(117, 'Tiny Journal', '<0.1', '<0.1', 'Q3')], ...filler(1100)]);
    const by = (n: string) => pdf.journals.find((j) => j.name === n)!;
    expect(by('Akustika')).toMatchObject({ jif: '0.2', quartile: 'Q4' });
    expect(by('Old Journal')).toMatchObject({ jif: null, quartile: null });
    expect(by('Tiny Journal')).toMatchObject({ jif: '<0.1', quartile: 'Q3' });
  });

  it('reads a long name that runs under the figures’ columns as one name', () => {
    const long = [word(57, 89, 'Journal'), word(110, 89, 'of'), word(130, 89, 'Nondestructive'), word(210, 89, 'Evaluation,'), word(290, 89, 'Diagnostics'), word(340, 89, 'and'),
      word(384, 89, '1.9'), word(439, 89, '2.1'), word(491, 89, 'Q2')];
    const pdf = linesToRows([[...header(75), ...long], ...filler(1100)]);
    expect(pdf.journals.some((j) => j.name === 'Journal of Nondestructive Evaluation, Diagnostics and' && j.jif === '1.9')).toBe(true);
  });

  it('refuses a file that is not this list', () => {
    expect(() => linesToRows([filler(1100)[0]!])).toThrow(/Journal Citation Reports/);                  // no heading, too few journals
    expect(() => linesToRows([[...header(75), ...row(89, 'A', '1.0', '1.0', 'Q1')]])).toThrow(/Journal Citation Reports/);
    const noisy = filler(1100).map((p) => [...p, ...Array.from({ length: 30 }, (_, i) => word(57, 900 + i, 'junk line'))]);
    expect(() => linesToRows([[...header(75)], ...noisy])).toThrow(/Journal Citation Reports/);
  });
});

describe('a journal’s name as it is compared', () => {
  it('ignores case, accents, "&", punctuation, spacing and a leading "The"', () => {
    expect(journalTitleKey('THE Journal of  Chemical-Physics')).toBe(journalTitleKey('journal of chemical physics'));
    expect(journalTitleKey('Zeitschrift für Naturforschung')).toBe(journalTitleKey('Zeitschrift fur Naturforschung'));
    expect(journalTitleKey('Science & Technology')).toBe(journalTitleKey('Science and Technology'));
  });

  it('cuts at 90 characters, so a name the source cut short equals the full name', () => {
    const full = 'ZEITSCHRIFT FUR PHYSIKALISCHE CHEMIE-INTERNATIONAL JOURNAL OF RESEARCH IN PHYSICAL CHEMISTRY & CHEMICAL PHYSICS';
    expect(journalTitleKey(full.slice(0, 100))).toBe(journalTitleKey(full));
    expect(journalTitleKey(full).length).toBeLessThanOrEqual(90);
  });

  it('tells two different journals apart', () => {
    expect(journalTitleKey('Nature Reviews Cancer')).not.toBe(journalTitleKey('Nature Reviews Cardiology'));
  });
});
