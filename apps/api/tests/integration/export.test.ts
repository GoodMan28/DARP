import { describe, it, expect } from 'vitest';
import type ExcelJS from 'exceljs';
import {
  buildPlans, plannedHeaders, amountInWords, norm,
  EXPORTABLE_STATUSES, WORKBOOK_KEYS,
} from '@/server/export/mapping';

/**
 * The exporter imports the database module, which needs DATABASE_URL at import time.
 * The mapping half is pure and always runs.
 */
const hasDb = !!process.env.DATABASE_URL;

function sheetText(sheet: ExcelJS.Worksheet | undefined): string {
  let text = '';
  sheet?.eachRow((row) => row.eachCell((c) => { text += ` ${c.text}`; }));
  return text;
}

describe('export mapping', () => {
  it('only verified and approved records are exportable', () => {
    expect([...EXPORTABLE_STATUSES].sort()).toEqual(['approved', 'verified']);
  });

  it('every plan targets a known workbook and has something to write', () => {
    const plans = buildPlans();
    expect(plans.length).toBeGreaterThan(0);
    for (const p of plans) {
      expect(WORKBOOK_KEYS).toContain(p.workbook);
      expect(p.sheet.trim().length).toBeGreaterThan(0);
      expect(plannedHeaders(p).length, `${p.workbook}/${p.sheet} has no columns`)
        .toBeGreaterThan(0);
    }
  });

  it('no plan maps two fields onto the same column header', () => {
    for (const p of buildPlans()) {
      const headers = plannedHeaders(p).map(norm);
      expect(new Set(headers).size, `duplicate header in ${p.workbook}/${p.sheet}`)
        .toBe(headers.length);
    }
  });

  it('splits the consultancy sheet into its two tables', () => {
    const consultancy = buildPlans().filter((p) => p.moduleKey === 'consultancy');
    expect(consultancy.length).toBeGreaterThanOrEqual(2);
    const filters = consultancy.map((p) => p.rowFilter?.in.join(','));
    expect(filters).toContain('Consultancy');
    expect(filters).toContain('Corporate training');
  });

  it('converts seed money to lakhs and nothing else', () => {
    for (const p of buildPlans()) {
      if (p.moduleKey === 'seedmoney') expect(p.divideBy).toEqual({ amount: 100000 });
      else expect(p.divideBy).toBeUndefined();
    }
  });

  it('writes amounts in words for the EDP/MDP sheet', () => {
    expect(amountInWords(4820000)).toBe('Rupees Forty Eight Lakh Twenty Thousand only');
    expect(amountInWords(105)).toBe('Rupees One Hundred Five only');
    expect(amountInWords(0)).toBe('');
    expect(amountInWords(-1)).toBe('');
  });
});

describe.skipIf(!hasDb)('export contents', () => {
  it('writes seed money in lakhs and fills the system columns', async () => {
    const { generateWorkbookFromRows } = await import('@/server/export/excel');
    const result = await generateWorkbookFromRows(
      'drie',
      { cycleId: 'test-cycle', includePii: false },
      {
        seedmoney: [{
          data: { grantDate: '2023-04-01', amount: '450000' },
          ownerName: 'Dr Test Faculty',
          department: 'Computer Science & Engg.',
          profile: {},
        }],
      },
    );

    const sheet = result.workbook.getWorksheet('Seed money');
    expect(sheet).toBeDefined();

    let foundLakhs = false;
    sheet?.eachRow((r) => r.eachCell((c) => { if (Number(c.value) === 4.5) foundLakhs = true; }));
    expect(foundLakhs, 'seed money should appear as 4.5 lakh, not 450000').toBe(true);
    // The recipient's name is a system column, never typed by the user.
    expect(sheetText(sheet)).toContain('Dr Test Faculty');
  });

  it('numbers rows and fills the department without asking the user', async () => {
    const { generateWorkbookFromRows } = await import('@/server/export/excel');
    const result = await generateWorkbookFromRows(
      'drie',
      { cycleId: 'test-cycle', includePii: false },
      {
        publications: [{
          data: { doi: '10.1/live', title: 'Verified paper', year: '2024' },
          ownerName: 'Dr Test Faculty',
          department: 'Computer Science & Engg.',
          profile: {},
        }],
      },
    );
    const text = sheetText(result.workbook.getWorksheet('Publications'));
    expect(text).toContain('10.1/live');
    expect(text).toMatch(/Computer Science/);
  });

  it('masks PAN and Aadhaar unless PII is explicitly requested', async () => {
    const { generateWorkbookFromRows } = await import('@/server/export/excel');
    const rows = {
      profile: [{
        data: { name: 'Dr Test', pan: 'ABCDE1234F', aadhaar: '234567890123', designation: 'Professor' },
        ownerName: 'Dr Test',
        department: 'Computer Science & Engg.',
        profile: {},
      }],
    };

    const masked = await generateWorkbookFromRows(
      'faculty', { cycleId: 'test-cycle', includePii: false }, rows,
    );
    const maskedText = sheetText(masked.workbook.getWorksheet('Profile'));
    expect(maskedText).not.toContain('ABCDE1234F');
    expect(maskedText).not.toContain('234567890123');
    expect(maskedText).toContain('XXXXX1234X');
    expect(masked.piiRevealed).toBe(0);

    const revealed = await generateWorkbookFromRows(
      'faculty', { cycleId: 'test-cycle', includePii: true }, rows,
    );
    expect(sheetText(revealed.workbook.getWorksheet('Profile'))).toContain('ABCDE1234F');
    // The caller writes one 'pii.reveal' audit entry when this is above zero.
    expect(revealed.piiRevealed).toBeGreaterThan(0);
  });

  it('reports which path produced the workbook, and never writes the template back', async () => {
    const { generateWorkbookFromRows, hasTemplate, templatePath } =
      await import('@/server/export/excel');
    const { statSync, existsSync } = await import('node:fs');

    const before = hasTemplate('drie') ? statSync(templatePath('drie')).mtimeMs : null;
    const result = await generateWorkbookFromRows(
      'drie', { cycleId: 'test-cycle', includePii: false }, {},
    );
    expect(result.mode).toBe(hasTemplate('drie') ? 'template' : 'generated');
    if (before !== null && existsSync(templatePath('drie'))) {
      expect(statSync(templatePath('drie')).mtimeMs).toBe(before);
    }
  });

  it('produces a workbook for every one of the six keys', async () => {
    const { generateWorkbookFromRows } = await import('@/server/export/excel');
    for (const key of WORKBOOK_KEYS) {
      const result = await generateWorkbookFromRows(
        key, { cycleId: 'test-cycle', includePii: false }, {},
      );
      expect(result.sheetsWritten, `${key} produced no sheets`).toBeGreaterThan(0);
      const buffer = await result.workbook.xlsx.writeBuffer();
      expect((buffer as ArrayBuffer).byteLength).toBeGreaterThan(0);
    }
  });
});
