import { z } from 'zod';
import { withRoute, ok, fail } from '@/server/http/handler';
import { getList } from '@/server/records/masterLists';
import { audit } from '@/server/audit/log';
import {
  journalListSummary, storeSjrRows, storeListRows, storeJcrRows, clearJournalList,
} from '@/server/lookup/journals';
import { scopusListStatus, syncScopusList } from '@/server/lookup/scopusList';
import { patentIndexStatus, updatePatentIndex } from '@/server/lookup/patentIndex';

/**
 * The journal lists a paper's indexing, quartile and Impact Factor are worked out from (SCImago SJR,
 * Web of Science collections, Journal Citation Reports). The browser parses the downloaded CSV and sends the ISSN rows here in batches, so a 10 MB file
 * never has to cross the proxy in one piece.
 */

export const GET = withRoute(
  { roles: ['admin'], capability: 'manageLists', rate: { limit: 60, windowSeconds: 60 } },
  async () => ok({
    ...(await journalListSummary()),
    listNames: await getList('indexingTypes'),
    scopus: await scopusListStatus(),
    patents: await patentIndexStatus(),
  }),
);

const rowSchema = z.object({
  issn: z.string().regex(/^\d{7}[\dX]$/),
  title: z.string().max(500),
  sourceType: z.string().max(60).optional(),
  quartile: z.enum(['Q1', 'Q2', 'Q3', 'Q4']).nullable().optional(),
  /** SCImago only: the years Scopus covered the journal. */
  coverage: z.string().max(200).optional(),
});

const jcrRowSchema = z.object({
  issn: z.string().regex(/^\d{7}[\dX]$/),
  title: z.string().max(500),
  jif: z.string().regex(/^<?\d{1,4}(\.\d{1,3})?$/).nullable(),
  jifQuartile: z.enum(['Q1', 'Q2', 'Q3', 'Q4']).nullable(),
  categories: z.string().max(500),
  editions: z.string().max(60),
});

const bodySchema = z.discriminatedUnion('action', [
  /** Fetch Elsevier's public Scopus list again now, instead of waiting for the nightly check. */
  z.object({ action: z.literal('syncScopus') }),
  /** Read any Patent Office Journal issue not read yet, in the background (the first time, hours). */
  z.object({ action: z.literal('syncPatents') }),
  z.object({
    action: z.literal('import'),
    kind: z.enum(['sjr', 'list']),
    year: z.number().int().min(1999).max(2100),
    listName: z.string().max(40).optional(),
    rows: z.array(rowSchema).min(1).max(5000),
    /** The last batch of a file: written to the audit log once, with the totals. */
    last: z.boolean().default(false),
    totalRows: z.number().int().min(0).optional(),
    fileName: z.string().max(200).optional(),
  }),
  /** One batch of a Journal Citation Reports export (Impact Factor and JIF quartile). */
  z.object({
    action: z.literal('importJcr'),
    jifYear: z.number().int().min(1997).max(2100),
    rows: z.array(jcrRowSchema).min(1).max(5000),
    last: z.boolean().default(false),
    totalRows: z.number().int().min(0).optional(),
    fileName: z.string().max(200).optional(),
  }),
  z.object({
    action: z.literal('clear'),
    kind: z.enum(['sjr', 'list', 'jcr']),
    year: z.number().int().min(1999).max(2100),
    listName: z.string().max(40).optional(),
  }),
]);

export const POST = withRoute(
  { roles: ['admin'], capability: 'manageLists', schema: bodySchema, rate: { limit: 300, windowSeconds: 60 } },
  async ({ actor, body }) => {
    if (body.action === 'syncScopus') {
      try {
        const status = await syncScopusList();
        await audit({
          actor, action: 'masterlist.update', entity: 'masterlist',
          meta: { journalList: 'Scopus (automatic)', file: status.file, journals: status.journals },
        });
        return ok(status);
      } catch (e) {
        return fail('INTERNAL', { message: `The Scopus list could not be fetched: ${e instanceof Error ? e.message : 'unknown error'}` });
      }
    }

    if (body.action === 'syncPatents') {
      if (process.env.LOOKUP_OFFLINE === '1') {
        return fail('VALIDATION', { message: 'Lookups are switched off on this server (LOOKUP_OFFLINE=1).' });
      }
      void updatePatentIndex();
      await audit({
        actor, action: 'masterlist.update', entity: 'masterlist', meta: { journalList: 'Patent Office Journal (automatic)' },
      });
      return ok(await patentIndexStatus());
    }

    if (body.action === 'importJcr') {
      const stored = await storeJcrRows(body.jifYear, body.rows);
      if (body.last) {
        await audit({
          actor, action: 'masterlist.update', entity: 'masterlist',
          meta: { journalList: 'JCR', year: body.jifYear, rows: body.totalRows ?? stored, file: body.fileName ?? null },
        });
      }
      return ok({ stored });
    }

    if (body.kind === 'list') {
      const allowed = await getList('indexingTypes');
      if (!body.listName || !allowed.includes(body.listName)) {
        return fail('VALIDATION', {
          message: 'Choose an index from the Indexing master list.',
          fields: { listName: 'Not in the Indexing master list.' },
        });
      }
    }

    if (body.action === 'clear') {
      await clearJournalList(body.kind, body.year, body.listName);
      await audit({
        actor, action: 'masterlist.update', entity: 'masterlist',
        meta: { journalList: body.kind === 'sjr' ? 'SJR' : body.kind === 'jcr' ? 'JCR' : body.listName, year: body.year, cleared: true },
      });
      return ok({ cleared: true });
    }

    const stored = body.kind === 'sjr'
      ? await storeSjrRows(body.year, body.rows)
      : await storeListRows(body.listName!, body.year, body.rows);

    if (body.last) {
      await audit({
        actor, action: 'masterlist.update', entity: 'masterlist',
        meta: {
          journalList: body.kind === 'sjr' ? 'SJR' : body.listName,
          year: body.year, rows: body.totalRows ?? stored, file: body.fileName ?? null,
        },
      });
    }
    return ok({ stored });
  },
);
