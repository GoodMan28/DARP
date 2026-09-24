'use client';

import { Card, CardHeader, LinkButton, Notice, Table, Td, Th } from '@/components/ui';
import { IconDownload } from '@/components/shell/Icon';
import type { WorkbookKey } from '@/modules/_types';

const WORKBOOKS: ReadonlyArray<{ key: WorkbookKey; name: string; office: string; contents: string }> = [
  { key: 'faculty', name: 'Faculty Profile', office: 'DOFA', contents: 'Identity, qualifications, appointment and every computed profile counter' },
  { key: 'drie', name: 'Research & Innovation', office: 'DRIE', contents: 'Publications, patents, grants, consultancy, fellowships, awards, seed money' },
  { key: 'dofa', name: 'Faculty Affairs', office: 'DOFA', contents: 'FDPs attended, financial support, quality assurance initiatives' },
  { key: 'dugs', name: 'UG & PG Studies', office: 'DUGS / DPGS', contents: 'Mentorship, workshops, e-content, curriculum feedback' },
  { key: 'hod', name: 'Department Return', office: 'Departments', contents: 'Department-owned returns, one sheet per department' },
  { key: 'cdc', name: 'Competitive Examinations', office: 'CDC', contents: 'Students qualifying NET, GATE, CAT and the rest' },
];

/**
 * Links only. `/api/export/[workbook]` is built and guarded elsewhere; it checks the
 * `export` capability and writes an `export.generate` audit row of its own.
 */
export function ExportsPanel() {
  return (
    <div className="space-y-3">
      <Notice tone="info" title="Exports are generated from verified and approved records">
        A draft or submitted record is not in the workbook. Approve what should count before you send
        anything to NAAC, and check the completion board first.
      </Notice>

      <Card padded={false}>
        <CardHeader
          title="Workbooks"
          subtitle="The six original spreadsheets, rebuilt in their own layout from the records in DARP."
        />
        <Table>
          <thead>
            <tr>
              <Th>Workbook</Th>
              <Th>Owning office</Th>
              <Th>Contents</Th>
              <Th className="w-36 text-right">Download</Th>
            </tr>
          </thead>
          <tbody>
            {WORKBOOKS.map((w) => (
              <tr key={w.key}>
                <Td className="font-semibold">
                  {w.name}
                  <div className="font-mono text-2xs font-normal text-ink-faint">{w.key}</div>
                </Td>
                <Td className="text-ink-muted">{w.office}</Td>
                <Td className="text-xs text-ink-muted">{w.contents}</Td>
                <Td className="text-right">
                  <LinkButton
                    variant="secondary"
                    href={`/api/export/${w.key}`}
                    className="min-h-8 px-2.5 py-1 text-xs"
                  >
                    <IconDownload width={12} height={12} />
                    Export
                  </LinkButton>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <p className="text-xs text-ink-muted">
        Every export is rate-limited and written to the audit log with the workbook name and the
        number of rows it contained.
      </p>
    </div>
  );
}
