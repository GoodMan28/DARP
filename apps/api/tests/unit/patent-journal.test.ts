import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseJournalPages, personName, tidyCase, journalNumber, isoDate, type TextItem,
} from '@/server/lookup/patentJournal';
import { parseJournalListing } from '@/server/lookup/patentIndex';
import { normalisePatentNumber } from '@/server/records/patentNumber';

// Real pages of the Patent Office Journal (issues 16/2024 and 41/2026), as pdf.js gives them.
const pages = (name: string): TextItem[][] => JSON.parse(
  readFileSync(join(__dirname, '..', 'fixtures', 'patent-journal', `${name}.json`), 'utf8'),
) as TextItem[][];

describe('application pages', () => {
  const { applications, grants } = parseJournalPages(pages('applications'));

  it('reads a BIT Mesra application: number, dates, title, applicant and every inventor', () => {
    expect(grants).toEqual([]);
    expect(applications[0]).toEqual({
      applicationNo: '202331085872',
      title: 'An integrated apparatus for blanching, sterilization, drying, and recovery of volatile components',
      filedDate: '2023-12-15',
      publishedDate: '2024-04-19',
      applicants: ['Birla Institute of Technology Mesra'],
      inventors: [
        { name: 'Dr. Anupam Roy', bit: true },
        { name: 'Bijendra Sahoo', bit: true },
        { name: 'Shubhajit Sarkhel', bit: true },
        { name: 'Ankanksha Kumari', bit: true },
      ],
    });
  });

  it('finds the title when "(54)" is printed in two pieces', () => {
    expect(applications[1]).toMatchObject({
      applicationNo: '202428016196', title: 'SPECTACLE LENSES WITH AUXILIARY OPTICAL ELEMENTS',
      inventors: [{ name: 'Ravi Chandra Bakaraju', bit: false }, { name: 'Klaus Ehrmann', bit: false }],
    });
  });

  it('keeps a company name with a comma as it is, and reads "Inventor: NA" as no inventors', () => {
    expect(applications[2]).toMatchObject({
      applicationNo: '202517134306',
      applicants: ['Cisco Technology, Inc.', 'THUBERT, Pascal', 'PIGNATARO, Carlos', 'BANERJEE, Ayan'],
      inventors: [],
    });
  });
});

describe('the grant table', () => {
  it('reads every row of the Delhi and Mumbai tables, a wrapped title and patentee included', () => {
    const { grants, applications } = parseJournalPages(pages('grants-2024'));
    expect(applications).toEqual([]);
    expect(grants).toHaveLength(41);
    expect(grants[0]).toEqual({
      patentNo: '532394', applicationNo: '202117023364',
      title: 'A METHOD OF MANUFACTURING MARTENSITIC STEEL AND A MARTENSITIC STEEL THEREOF',
      patentee: 'ARCELORMITTAL', filedDate: '2019-11-15', publishedDate: '2021-11-05', office: 'DELHI',
    });
    // Its patentee is printed beside the next title: centring decides whose it is.
    expect(grants[1]).toMatchObject({ patentNo: '532396', title: 'USE OF GUAR GUM IN BIOFUNGICIDE COMPOSITIONS', patentee: 'SPECIALTY OPERATIONS FRANCE' });
    // A patent number in two pieces ("5327" "08") is still a row of its own.
    expect(grants.find((g) => g.patentNo === '532708')?.title).toBe('CRYSTAL OF PYRIDO[3 4-D]PYRIMIDINE DERIVATIVE OR SOLVATE THEREOF');
    expect(grants.find((g) => g.patentNo === '532711')?.title).toBe('SIGNAL MULTIPLEXER FOR SONAR');
    // An older application number, and the Mumbai table's own column positions and two-line dates.
    expect(grants.find((g) => g.patentNo === '532727')?.applicationNo).toBe('158/DEL/2012');
    expect(grants.find((g) => g.patentNo === '532495')).toEqual({
      patentNo: '532495', applicationNo: '201821039649', title: 'SYSTEMS AND METHODS FOR CONVERSATIONAL BASED TICKET LOGGING',
      patentee: 'Tata Consultancy Services Limited', filedDate: '2018-10-19', publishedDate: '2020-04-24', office: 'MUMBAI',
    });
  });

  it('gives each line to the right row on a crowded page, and joins a row cut by the page break', () => {
    const { grants } = parseJournalPages(pages('grants-2026'));
    const title = (n: string) => grants.find((g) => g.patentNo === n)?.title;
    expect(title('604806')).toBe('METHOD FOR CONTROLLING CLIPBOARD AND ELECTRONIC DEVICE FOR PERFORMING SAME METHOD');
    expect(title('604809')).toBe('METHOD FOR REFINING MOLTEN IRON');
    expect(title('604815')).toBe('SKIN-TO-SKIN CONTACT DETECTION');
    expect(title('604817')).toBe('BIOFEEDBACK DEVICE FOR PERSONALIZED ANXIETY AND STRESS MANAGEMENT');
    expect(title('604820')).toBe('PAPER-BASED APTASENSOR FOR THE DETECTION OF THE FOUR SEROTYPES OF DENGUE VIRUS');
  });

  it('gives the same answer whatever the rounding of the positions', () => {
    const rounded = pages('grants-2026').map((p) => p.map((i) => ({ ...i, x: Math.round(i.x), y: Math.round(i.y) })));
    expect(parseJournalPages(rounded).grants.map((g) => g.title))
      .toEqual(parseJournalPages(pages('grants-2026')).grants.map((g) => g.title));
  });
});

describe('text helpers', () => {
  it('turns "SURNAME, Given" into "Given Surname" and tidies capitals', () => {
    expect(personName('ROY, Dr. Anupam')).toBe('Dr. Anupam Roy');
    expect(personName('Dr. Gajendra Kant Mishra')).toBe('Dr. Gajendra Kant Mishra');
    expect(tidyCase('BIRLA INSTITUTE OF TECHNOLOGY MESRA')).toBe('Birla Institute of Technology Mesra');
  });

  it('writes numbers and dates the way the portal stores them', () => {
    expect(journalNumber('0935/kol/2013')).toBe('935/KOL/2013');
    expect(isoDate('19/04/2024')).toBe('2024-04-19');
    expect(isoDate('17:41:00')).toBe('');
    // What the journal prints is what a faculty member's typed number normalises to.
    expect(normalisePatentNumber('IN202331085872A', 'India')).toEqual({ value: '202331085872' });
  });
});

describe('the journal listing page', () => {
  const html = `
    <tbody><tr>
      <td>1</td><td>41/2026</td><td>09/10/2026</td><td>09/10/2026</td>
      <td>
        <form action="/IPOJournal/Journal/ViewJournal" method="post"><input type="hidden" name="FileName" value="ipo-docs\\IPIndia_Docs\\PAT\\2026\\41_2026\\Official Journal (41-2026) 09.10.2026) 1st part.pdf" />
          <button type="submit" class="btn btn-link">Part I <img src="x.png" /></button></form>
        <form action="/IPOJournal/Journal/ViewJournal" method="post"><input type="hidden" name="FileName" value="ipo-docs\\IPIndia_Docs\\PAT\\2026\\41_2026\\Official Journal (41-2026) 09.10.2026) DesignS.pdf" />
          <button type="submit" class="btn btn-link">Part IV - Designs <img src="x.png" /></button></form>
      </td>
    </tr><tr>
      <td>2</td><td>53/2021</td><td>31/12/2021</td><td>31/12/2021</td>
      <td><form><input type="hidden" name="FileName" value="ipo-docs\\IPIndia_Docs\\PAT\\2021\\53_2021\\Part-1.pdf" />
        <button type="submit" class="btn btn-link">Part I</button></form></td>
    </tr></tbody>`;

  it('lists each issue with its date and its parts, leaving out designs', () => {
    expect(parseJournalListing(html)).toEqual([
      { issue: '41/2026', date: '2026-10-09', files: ['ipo-docs\\IPIndia_Docs\\PAT\\2026\\41_2026\\Official Journal (41-2026) 09.10.2026) 1st part.pdf'] },
      { issue: '53/2021', date: '2021-12-31', files: ['ipo-docs\\IPIndia_Docs\\PAT\\2021\\53_2021\\Part-1.pdf'] },
    ]);
  });
});
