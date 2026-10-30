import ExcelJS from 'exceljs';
import type { ModuleConfig } from '@darp/shared/modules/types';
import { describeView, type ViewColumn, type ViewState } from '@darp/shared/views';
import { displayValue, STATUS_LABEL } from '@darp/shared/format';
import type { ExportData } from './service';

/** A text cell that a spreadsheet would run as a formula ("=SUM(…)", "+1…", "@…") is made plain text. */
export function safeCell(s: string): string {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

interface Shown { key: string; label: string; kind: ViewColumn['kind'] | 'derived'; type?: string; naWhenEmpty?: boolean }

/** The columns of the export, as the page shows them: the view's choice, else the module's usual ones. */
export function shownColumns(m: ModuleConfig, view: ViewState, columns: ViewColumn[]): Shown[] {
  const out: Shown[] = [];
  for (const key of view.cols ?? m.listColumns) {
    const f = m.fields.find((x) => x.key === key);
    const col = columns.find((c) => c.key === key && !c.meta);
    const d = m.derived?.find((x) => x.key === key);
    if (f && col) out.push({ key, label: f.label, kind: col.kind, type: f.type, naWhenEmpty: f.naWhenEmpty });
    else if (d) out.push({ key, label: d.label, kind: 'derived' });
  }
  return out;
}

const HEAD = ['S. No.', 'Entered by', 'Department', 'Status', 'Year'];

/** One row's cells as text, as the page would show them. */
function cells(m: ModuleConfig, data: ExportData['rows'][number], shown: Shown[], serial: number): string[] {
  return [
    String(serial), data.ownerName, data.department, STATUS_LABEL[data.status] ?? data.status, data.periodLabel,
    ...shown.map((s) => {
      if (s.kind === 'derived') return data.derived[s.key] ?? '';
      const raw = data.data[s.key];
      if (s.kind === 'file') return raw ? 'Attached' : '';
      if (raw === undefined || raw === null || raw === '') return s.naWhenEmpty ? 'NA' : '';
      return displayValue(raw, s.type);
    }),
  ];
}

/** The export as CSV (UTF-8 with a byte-order mark, so Excel reads accents), and the number of rows. */
export function toCsv(m: ModuleConfig, data: ExportData): Uint8Array {
  const shown = shownColumns(m, data.view, data.columns);
  const esc = (s: string) => `"${safeCell(s).replace(/"/g, '""')}"`;
  const lines = [[...HEAD, ...shown.map((s) => s.label)], ...data.rows.map((r, i) => cells(m, r, shown, i + 1))]
    .map((row) => row.map(esc).join(','));
  // A byte-order mark first, so Excel reads accents and non-Latin names.
  return new TextEncoder().encode(String.fromCharCode(0xfeff) + lines.join('\r\n') + '\r\n');
}

/** The export as an Excel workbook: the records, and a second sheet saying how it was made. */
export async function toXlsx(
  m: ModuleConfig, data: ExportData, by: string, now: Date,
): Promise<Uint8Array> {
  const shown = shownColumns(m, data.view, data.columns);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'DARP — BIT Mesra';
  wb.created = now;
  const ws = wb.addWorksheet(m.name.replace(/[:\\/?*[\]]/g, '-').slice(0, 31));
  ws.addRow([...HEAD, ...shown.map((s) => s.label)]);
  data.rows.forEach((r, i) => {
    const row = ws.addRow(cells(m, r, shown, i + 1).map(safeCell));
    shown.forEach((s, j) => {
      const raw = r.data[s.key];
      const cell = row.getCell(HEAD.length + j + 1);
      if (s.kind === 'date' && typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw)) {
        cell.value = new Date(`${raw.slice(0, 10)}T00:00:00Z`);
        cell.numFmt = 'dd-mm-yyyy';
      } else if ((s.kind === 'number' || s.kind === 'year') && raw !== '' && raw !== null && raw !== undefined && Number.isFinite(Number(String(raw).replace(/[^\d.-]/g, '')))) {
        cell.value = Number(String(raw).replace(/[^\d.-]/g, ''));
      }
    });
  });
  const head = ws.getRow(1);
  head.font = { bold: true };
  head.alignment = { vertical: 'middle', wrapText: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.columns.forEach((c, i) => { c.width = i < HEAD.length ? 16 : Math.min(Math.max(shown[i - HEAD.length]!.label.length + 2, 14), 48); });

  const about = wb.addWorksheet('About this export');
  const filter = describeView(data.view, data.columns);
  for (const [k, v] of [
    ['Module', m.name],
    ['Filter', filter || 'None: every record you can see'],
    ['Records', data.rows.length + (data.truncated ? ' (the first 10,000; narrow the filter to see the rest)' : '')],
    ['Made by', `${by} on ${now.toLocaleString('en-GB', { timeZone: 'Asia/Kolkata' })}`],
    ['Note', 'Statuses are as on the module page. For the approved-only official formats, use Reports.'],
  ] as const) about.addRow([k, v]);
  about.getColumn(1).width = 14;
  about.getColumn(1).font = { bold: true };
  about.getColumn(2).width = 100;
  return new Uint8Array(await wb.xlsx.writeBuffer() as ArrayBuffer);
}
