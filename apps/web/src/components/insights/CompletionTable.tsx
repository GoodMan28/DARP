import { Card, CardHeader, Table, Th, Td } from '@/components/ui';
import type { DepartmentCompletionRow } from '@darp/shared/contracts';

/** How far each department has got with its data: aggregates only, no record contents. */
export function CompletionTable({ rows, title = 'Completion by department' }: { rows: DepartmentCompletionRow[]; title?: string }) {
  return (
    <Card padded={false}>
      <CardHeader title={title} subtitle="Aggregates only — no record contents are shown here." />
      <div className="overflow-x-auto">
        <Table className="min-w-[36rem]">
          <thead>
            <tr>
              <Th>Department</Th>
              <Th className="w-24 text-right">Faculty</Th>
              <Th className="w-28 text-right">Reporting</Th>
              <Th className="w-24 text-right">Records</Th>
              <Th className="w-40">Modules covered</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.departmentId} className="hover:bg-surface-2">
                <Td>
                  <span className="font-medium">{d.department}</span>
                  <span className="ml-1.5 font-mono text-2xs text-ink-faint">{d.departmentCode}</span>
                </Td>
                <Td className="text-right font-mono tabular-nums">{d.facultyTotal}</Td>
                <Td className="text-right font-mono tabular-nums">{d.facultyReporting}</Td>
                <Td className="text-right font-mono tabular-nums">{d.records}</Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-24 overflow-hidden rounded-xs bg-surface-inset">
                      <div className="h-full bg-primary" style={{ width: `${Math.min(d.pct, 100)}%` }} />
                    </div>
                    <span className="font-mono text-2xs tabular-nums text-ink-muted">{d.modulesComplete}/{d.modulesApplicable}</span>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </Card>
  );
}
