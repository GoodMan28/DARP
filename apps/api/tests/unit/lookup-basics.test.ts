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

  it('refuses a BITS campus printed without "and Science", as the patent journal does', () => {
    // Application 202441079295, Patent Office Journal 44/2024, page 503.
    expect(isBitAffiliation('Birla Institute of Technology, Hyderabad Campus, Jawahar Nagar, Kapra Mandal, Hyderabad, Telangana – 500078, India')).toBe(false);
    expect(isBitAffiliation('Birla Institute of Technology, Pilani, Rajasthan')).toBe(false);
    expect(isBitAffiliation('Birla Institute of Technology, Off-Campus Patna, Bihar')).toBe(true);
    expect(isBitAffiliation('Department of ECE, Birla Institute of Technology, Lalpur, Ranchi')).toBe(true);
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

describe('namesMatch with names in parts', () => {
  const verma = { prefix: 'Dr.', first: 'Anil', middle: 'Kumar', last: 'Verma' };
  const full = (s: string) => ({ given: '', family: '', full: s });

  it('reads the forms a name is published in', () => {
    expect(namesMatch(verma, p('A. K.', 'Verma'))).toBe(true);
    expect(namesMatch(verma, full('A. K. Verma'))).toBe(true);
    expect(namesMatch(verma, full('Verma A.K.'))).toBe(true);
    expect(namesMatch(verma, full('Verma AK'))).toBe(true);
    expect(namesMatch(verma, full('Verma, Anil Kumar'))).toBe(true);
    expect(namesMatch(verma, full('Anil Kumar Verma'))).toBe(true);
    expect(namesMatch(verma, full('ANIL KUMAR VERMA'))).toBe(true);
  });

  it('tells namesakes apart by their initials', () => {
    expect(namesMatch(verma, full('A. P. Verma'))).toBe(false);
    expect(namesMatch(verma, full('Sunil Verma'))).toBe(false);
    expect(namesMatch(verma, full('Verma, S. K.'))).toBe(false);
  });

  it('keeps a short all-capitals surname whole', () => {
    const rao = { prefix: 'Dr.', first: 'Kiran', middle: '', last: 'Rao' };
    expect(namesMatch(rao, full('KIRAN RAO'))).toBe(true);
    expect(namesMatch(rao, full('KIRAN ROY'))).toBe(false);
  });

  it('matches a person with no surname only by the whole name', () => {
    const single = { prefix: 'Dr.', first: 'Ramanathan', middle: '', last: '' };
    expect(namesMatch(single, full('Ramanathan'))).toBe(true);
    expect(namesMatch(single, p('', 'Ramanathan'))).toBe(true);
    expect(namesMatch(single, full('R. Kumar'))).toBe(false);
  });

  it('accepts a two-word surname written together or apart', () => {
    const de = { prefix: 'Prof.', first: 'Partha', middle: '', last: 'De Sarkar' };
    expect(namesMatch(de, p('Partha', 'De Sarkar'))).toBe(true);
    expect(namesMatch(de, p('P.', 'DeSarkar'))).toBe(true);
    expect(namesMatch(de, p('P.', 'Sarkar'))).toBe(true);
  });
});
