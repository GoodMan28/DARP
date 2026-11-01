'use client';

import { useEffect, useState } from 'react';
import { apiJson } from '@/lib/csrf-client';
import { Button, Card, Table, Td, Th } from '@/components/ui';

interface Row { year: number; examName: string; studentName: string; registrationNo: string; rollNo: string; guide: string; department: string }

/**
 * For CDC and IQAC on the exams list: students the faculty entered as having qualified (in Students
 * Guided) that this list does not hold. They are in the report already; this shows who they are.
 */
export function FacultyExamsPanel() {
  const [data, setData] = useState<{ rows: Row[]; repeats: number } | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void apiJson<{ rows: Row[]; repeats: number }>('/api/exams/from-faculty').then((res) => { if (res.ok) setData(res.data); });
  }, []);

  if (!data || data.rows.length === 0) return null;
  const n = data.rows.length;
  return (
    <Card className="mb-4" padded={false}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <p className="text-sm text-ink">
          <strong>Faculty entered {n} more {n === 1 ? 'student' : 'students'}</strong> who qualified in a competitive exam.
          {data.repeats > 0 ? <span className="text-ink-muted"> {data.repeats} already in this list {data.repeats === 1 ? 'was' : 'were'} left out.</span> : null}
        </p>
        <Button variant="secondary" onClick={() => setOpen((o) => !o)}>{open ? 'Hide' : 'Show'}</Button>
      </div>
      {open ? (
        <>
          <Table>
            <thead>
              <tr><Th>Student</Th><Th>College roll no.</Th><Th>Exam</Th><Th>Registration no.</Th><Th>Year</Th><Th>Guide</Th><Th>Department</Th></tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => (
                <tr key={`${r.rollNo}-${r.examName}-${r.year}-${i}`}>
                  <Td className="font-medium">{r.studentName}</Td>
                  <Td className="font-mono text-xs">{r.rollNo || '—'}</Td>
                  <Td>{r.examName}</Td>
                  <Td className="font-mono text-xs">{r.registrationNo || '—'}</Td>
                  <Td>{r.year}</Td>
                  <Td>{r.guide}</Td>
                  <Td>{r.department || '—'}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <p className="border-t border-line px-4 py-2.5 text-2xs text-ink-muted">
            These are in your report already. To change one, ask the guide, or add your own entry for the student: yours takes its place.
          </p>
        </>
      ) : null}
    </Card>
  );
}
