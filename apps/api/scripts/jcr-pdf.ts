/**
 * Reads a Journal Citation Reports list printed to PDF, matches its journals to ISSNs, and says what loading it
 * would give. With --apply it loads it, replacing that year (the same as uploading it under Administration).
 *
 *   npm run db:jcr-pdf -w @darp/api -- "C:/path/IF2025 JCR.pdf"            reports; changes nothing
 *   npm run db:jcr-pdf -w @darp/api -- "C:/path/IF2025 JCR.pdf" --apply    loads it
 *
 * Journals found by name only are written to jcr-name-only.csv in this folder (a licensed list: never commit it).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { and, isNull, eq } from 'drizzle-orm';
import { db, pool } from '../src/server/db';
import { records } from '../src/server/db/schema';
import { readJcrPdf } from '../src/server/lookup/jcrPdf';
import { matchJcr, storeJcrPdf } from '../src/server/lookup/jcrImport';
import { journalTitleKey, normIssn } from '@darp/shared/journals';

const path = process.argv.slice(2).find((a) => !a.startsWith('--'));
const apply = process.argv.includes('--apply');
if (!path) throw new Error('Give the path of the PDF.');

const started = Date.now();
const pdf = await readJcrPdf(new Uint8Array(readFileSync(path)));
console.log(`Read ${pdf.rows} lines, ${pdf.journals.length} journals, JIF ${pdf.jifYear}, in ${Math.round((Date.now() - started) / 1000)} s.`);
const { report, issnRows } = await matchJcr(pdf);
console.log(`Matched by a Web of Science title: ${report.byWos}. By a Scopus or SJR title: ${report.byOther}. By name only: ${report.nameOnly.length} (${report.ambiguous} share a name with several journals).`);
console.log(`ISSNs that would carry an Impact Factor: ${report.issns}.`);
writeFileSync('jcr-name-only.csv', ['journal', ...report.nameOnly.map((n) => `"${n.replace(/"/g, '""')}"`)].join(String.fromCharCode(10)));

// What the papers in this database would get.
const byIssn = new Set(issnRows.map((r) => r.issn));
const byName = new Set(pdf.journals.map((j) => journalTitleKey(j.name)));
const papers = await db.select({ data: records.data }).from(records).where(and(eq(records.moduleKey, 'publications'), isNull(records.deletedAt)));
let viaIssn = 0; let viaName = 0; let neither = 0;
for (const p of papers) {
  const d = p.data as Record<string, unknown>;
  const issns = String(d.issn ?? '').split(/[,;\s]+/).map((s) => normIssn(s)).filter((x): x is string => x !== null);
  if (issns.some((i) => byIssn.has(i))) viaIssn += 1;
  else if (byName.has(journalTitleKey(String(d.journal ?? '')))) viaName += 1;
  else neither += 1;
}
console.log(`Publications here: ${papers.length}. Impact Factor by ISSN: ${viaIssn}. By the journal's name: ${viaName}. Neither: ${neither}.`);

if (apply) {
  const done = await storeJcrPdf(pdf);
  console.log(`Done: JIF ${done.jifYear} replaced with ${done.journals} journals and ${done.issns} ISSNs.`);
} else {
  console.log('Nothing was changed. Run again with --apply to load it.');
}
await pool.end();
