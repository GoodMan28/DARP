import { describe, it, expect } from 'vitest';
import { namesMatch, isBitAffiliation } from '@/server/lookup/names';
import { isbn13 } from '@/server/lookup/isbn';
import { normIssn } from '@/server/lookup/journals';
import { clean } from '@/server/lookup/text';

const p = (given: string, family: string) => ({ given, family, full: `${given} ${family}` });

describe('namesMatch', () => {
  it('matches initials against full given names', () => {
    expect(namesMatch('Dr A. K. Verma', p('Anil Kumar', 'Verma'))).toBe(true);
    expect(namesMatch('Prof. Vandana Bhattacharjee', p('Vandana', 'Bhattacharjee'))).toBe(true);
  });
  it('refuses a different surname or a different first initial', () => {
    expect(namesMatch('Dr A. K. Verma', p('Anil', 'Sharma'))).toBe(false);
    expect(namesMatch('Dr A. K. Verma', p('Sunil', 'Verma'))).toBe(false);
  });
  it('uses the full name when there is no family name', () => {
    expect(namesMatch('Dr S. Mahato', { given: '', family: '', full: 'S Mahato' })).toBe(true);
  });
});

describe('isBitAffiliation', () => {
  it('accepts BIT Mesra and refuses BITS Pilani', () => {
    expect(isBitAffiliation('Birla Institute of Technology, Mesra, Ranchi')).toBe(true);
    expect(isBitAffiliation('Birla Institute of Technology and Science, Pilani')).toBe(false);
    expect(isBitAffiliation('Somewhere', ['https://ror.org/028vtqb15'])).toBe(true);
  });
});

describe('isbn13', () => {
  it('validates and converts', () => {
    expect(isbn13('978-0-306-40615-7')).toBe('9780306406157');
    expect(isbn13('0-306-40615-2')).toBe('9780306406157');
    expect(isbn13('978-0-306-40615-8')).toBeNull();
  });
});

describe('normIssn / clean', () => {
  it('normalises', () => {
    expect(normIssn('0167-739x')).toBe('0167739X');
    expect(normIssn('123')).toBeNull();
    expect(clean('A &amp; B <i>x</i>')).toBe('A & B x');
  });
});

describe('namesMatch with Indian spelling variants', () => {
  it('accepts a surname spelt one letter differently when the first names agree', () => {
    // The real case: her account says Bhattacharjee, IEEE TKDE (10.1109/TKDE.2011.163) says Bhattacherjee.
    expect(namesMatch('Dr Vandana Bhattacharjee', { given: '', family: '', full: 'Vandana Bhattacherjee' })).toBe(true);
    expect(namesMatch('Dr Vandana Bhattacharjee', p('Vandana', 'Bhattacherjee'))).toBe(true);
    expect(namesMatch('Prof. Ravi Shankar Choudhary', p('Ravi Shankar', 'Chaudhary'))).toBe(true);
    expect(namesMatch('Dr Anjali Srivastava', p('Anjali', 'Shrivastava'))).toBe(true);
    expect(namesMatch('Dr A. K. Choudhary', p('A. K.', 'Chaudhary'))).toBe(true);
  });

  it('still refuses a different person', () => {
    expect(namesMatch('Dr Vandana Bhattacharjee', p('Vivek', 'Bhattacherjee'))).toBe(false);
    expect(namesMatch('Dr Vandana Bhattacharjee', p('Vandana', 'Banerjee'))).toBe(false);
    expect(namesMatch('Dr Vandana Bhattacharjee', { given: '', family: '', full: 'Bhattacherjee' })).toBe(false);
    expect(namesMatch('Dr Anil Rao', p('Anil', 'Roy'))).toBe(false);          // short surnames must match exactly
  });
});
