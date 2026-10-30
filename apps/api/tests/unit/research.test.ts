import { describe, it, expect, afterEach, vi } from 'vitest';
import { hIndex, qualitySignal, DEFAULT_THRESHOLDS, type MetricsRow } from '@darp/shared/research';

/* Phase 8: the h-index, the research-quality signal and the Scopus client (Elsevier mocked). */

describe('h-index', () => {
  it('is the largest h with h papers cited at least h times', () => {
    expect(hIndex([10, 8, 5, 4, 3])).toBe(4);
    expect(hIndex([25, 8, 5, 3, 3])).toBe(3);
    expect(hIndex([0, 0])).toBe(0);
    expect(hIndex([])).toBe(0);
    expect(hIndex([1])).toBe(1);
  });
});

const row = (over: Partial<MetricsRow>): MetricsRow => ({
  source: 'scopus', asOf: '2026-10-01', documents: null, citations: null, citationsExclSelf: null, hIndex: null, hIndexExclSelf: null, ...over,
});

describe('research-quality signal', () => {
  it('is quality-leaning when most papers are in WoS and in Q1/Q2 journals', () => {
    const s = qualitySignal(row({ documents: 20, citations: 200, citationsExclSelf: 150 }), row({ source: 'wos', documents: 14, hIndex: 6 }), 10, 6);
    expect(s).toMatchObject({ wosShare: 70, topShare: 60, citationsPerPaper: 7.5, citationsInclSelf: false, label: 'quality' });
  });

  it('is volume-leaning with many papers, few in Q1/Q2 and few citations', () => {
    const s = qualitySignal(row({ documents: 40, citations: 60, citationsExclSelf: 30 }), row({ source: 'wos', documents: 4 }), 20, 2);
    expect(s).toMatchObject({ wosShare: 10, topShare: 10, citationsPerPaper: 0.8, label: 'volume' });
  });

  it('uses citations with self-citations when the figure without is not available, and says so', () => {
    const s = qualitySignal(row({ documents: 40, citations: 60 }), null, 20, 2);
    expect(s).toMatchObject({ citationsPerPaper: 1.5, citationsInclSelf: true, label: 'volume' });
  });

  it('has not enough data below three documents, and is balanced otherwise', () => {
    expect(qualitySignal(null, null, 2, 1).label).toBe('unknown');
    expect(qualitySignal(row({ documents: 8, citations: 80 }), null, 5, 2).label).toBe('balanced');
  });

  it('follows IQAC’s thresholds', () => {
    const s = (t = DEFAULT_THRESHOLDS) => qualitySignal(row({ documents: 20, citations: 100 }), row({ source: 'wos', documents: 8 }), 10, 4, t).label;
    expect(s()).toBe('balanced');                           // WoS share 40% < 50%
    expect(s({ ...DEFAULT_THRESHOLDS, qualityWosShare: 40, qualityTopShare: 40 })).toBe('quality');
  });

  it('caps the WoS share at 100%', () => {
    expect(qualitySignal(row({ documents: 5 }), row({ source: 'wos', documents: 9 }), 5, 5).wosShare).toBe(100);
  });
});

describe('the Scopus client', () => {
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.ELSEVIER_API_KEY; });

  /** A fake Elsevier: answers by the path asked for. */
  function elsevier(routes: Array<[RegExp, number, unknown]>) {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push(url);
      expect((init.headers as Record<string, string>)['X-ELS-APIKey']).toBe('test-key');
      const hit = routes.find(([re]) => re.test(url));
      if (!hit) return new Response('{}', { status: 404 });
      return new Response(JSON.stringify(hit[2]), { status: hit[1], headers: { 'content-type': 'application/json' } });
    }));
    return calls;
  }

  const author = {
    'author-retrieval-response': [{
      coredata: { 'dc:identifier': 'AUTHOR_ID:57200000001', 'document-count': '30', 'citation-count': '410', 'cited-by-count': '380' },
      'h-index': '9',
    }],
  };
  const light = { 'author-retrieval-response': [{ 'preferred-name': { surname: 'Verma', 'given-name': 'Anil Kumar', 'indexed-name': 'Verma A.K.' } }] };
  const page = (start: number, n: number, total: number) => ({
    'search-results': {
      'opensearch:totalResults': String(total),
      entry: Array.from({ length: n }, (_, i) => ({ eid: `2-s2.0-${start + i}`, 'dc:identifier': `SCOPUS_ID:${1000 + start + i}`, 'citedby-count': String(30 - start - i) })),
    },
  });

  it('reads the figures, pages through 30 documents, and works out the figures without self-citations', async () => {
    process.env.ELSEVIER_API_KEY = 'test-key';
    process.env.ELSEVIER_GAP_MS = '0';
    const calls = elsevier([
      [/view=METRICS/, 200, author],
      [/view=LIGHT/, 200, light],
      [/search\/scopus.*start=0/, 200, page(0, 25, 30)],
      [/search\/scopus.*start=25/, 200, page(25, 5, 30)],
      [/abstract\/citations/, 200, { 'abstract-citations-response': { citeInfoMatrix: { citeInfoMatrixXML: { citationMatrix: { citeInfo: [
        { pcc: '5', rowTotal: '3', lcc: '0' }, { pcc: '4', rowTotal: '1', lcc: '0' }, { pcc: '1', rowTotal: '2', lcc: '0' },
      ] } } } } }],
    ]);
    const { scopusFigures } = await import('@/server/researchers/scopus');
    const f = await scopusFigures('57200000001');
    expect(f).toMatchObject({
      documents: 30, citations: 410, hIndex: 9,
      author: { given: 'Anil Kumar', family: 'Verma', indexed: 'Verma A.K.' },
    });
    // Two pages of documents; their ids go to Citation Overview 25 at a time (two calls).
    expect(calls.filter((c) => c.includes('/search/scopus'))).toHaveLength(2);
    expect(calls.filter((c) => c.includes('/abstract/citations'))).toHaveLength(2);
    expect(calls.find((c) => c.includes('/abstract/citations'))).toContain('citation=exclude-self');
  });

  it('leaves the figures without self-citations empty when Elsevier has not enabled Citation Overview', async () => {
    process.env.ELSEVIER_API_KEY = 'test-key';
    process.env.ELSEVIER_GAP_MS = '0';
    elsevier([
      [/view=METRICS/, 200, author],
      [/view=LIGHT/, 200, light],
      [/search\/scopus/, 200, page(0, 3, 3)],
      [/abstract\/citations/, 403, { 'service-error': { status: { statusCode: 'AUTHORIZATION_ERROR' } } }],
    ]);
    const { scopusFigures } = await import('@/server/researchers/scopus');
    const f = await scopusFigures('57200000001');
    expect(f).toMatchObject({ documents: 30, hIndex: 9, citationsExclSelf: null, hIndexExclSelf: null });
  });

  it('falls back to the paper search when Elsevier refuses the author views (a key used off campus)', async () => {
    process.env.ELSEVIER_API_KEY = 'test-key';
    process.env.ELSEVIER_GAP_MS = '0';
    elsevier([
      [/\/author\/author_id/, 401, { 'service-error': { status: { statusCode: 'AUTHORIZATION_ERROR' } } }],
      [/search\/scopus.*start=0/, 200, page(0, 25, 30)],
      [/search\/scopus.*start=25/, 200, page(25, 5, 30)],
      [/abstract\/citations/, 401, {}],
    ]);
    const { scopusFigures } = await import('@/server/researchers/scopus');
    const f = await scopusFigures('57200000001');
    // 30 papers cited 30, 29, … 1 times: 465 citations, and h-index 15 (the 15th paper has 16 citations).
    expect(f).toMatchObject({ author: null, documents: 30, citations: 465, hIndex: 15, citationsExclSelf: null, hIndexExclSelf: null });
  });

  it('reads a journal’s SJR, SNIP and CiteScore from the open serial view', async () => {
    process.env.ELSEVIER_API_KEY = 'test-key';
    process.env.ELSEVIER_GAP_MS = '0';
    const calls = elsevier([[/serial\/title\/issn\/20531583/, 200, { 'serial-metadata-response': { entry: [{
      'dc:title': '2D Materials', SJRList: { SJR: [{ '@year': '2024', $: '1.000' }, { '@year': '2025', $: '1.090' }] },
      SNIPList: { SNIP: [{ '@year': '2025', $: '0.868' }] }, citeScoreYearInfoList: { citeScoreCurrentMetric: '8.0' },
    }] } }]]);
    const { serialMetrics } = await import('@/server/researchers/scopus');
    expect(await serialMetrics('2053-1583')).toEqual({ title: '2D Materials', sjr: 1.09, sjrYear: 2025, snip: 0.868, citeScore: 8 });
    expect(calls[0]).toContain('/serial/title/issn/20531583');
    expect(await serialMetrics('0000-0000')).toBeNull();
  });

  it('says there is no such author, and refuses to run without a key', async () => {
    process.env.ELSEVIER_API_KEY = 'test-key';
    elsevier([]);
    const { scopusFigures, ScopusUnavailable } = await import('@/server/researchers/scopus');
    expect(await scopusFigures('99999999999')).toBeNull();
    delete process.env.ELSEVIER_API_KEY;
    await expect(scopusFigures('57200000001')).rejects.toBeInstanceOf(ScopusUnavailable);
  });
});

describe('IDs on an ORCID record', () => {
  it('reads the Scopus Author ID and ResearcherID under "Other IDs"', async () => {
    const { externalIdsOf } = await import('@/server/lookup/orcid');
    // As pub.orcid.org returned it for 0000-0002-2990-4738 on 30 October 2026.
    const person = { 'external-identifiers': { 'external-identifier': [
      { 'external-id-type': 'ResearcherID', 'external-id-value': 'M-9975-2013' },
      { 'external-id-type': 'Scopus Author ID', 'external-id-value': '35449392500' },
      { 'external-id-type': 'Loop profile', 'external-id-value': '12345' },
    ] } };
    expect(externalIdsOf(person)).toEqual({ scopusAuthorIds: ['35449392500'], researcherIds: ['M-9975-2013'] });
    expect(externalIdsOf(null)).toEqual({ scopusAuthorIds: [], researcherIds: [] });
  });
});

describe('enough data', () => {
  it('counts OpenAlex’s works when deciding there is enough to judge, but never in a share', () => {
    const oa = { source: 'openalex' as const, asOf: '2026-10-30', documents: 155, citations: 3271, citationsExclSelf: null, hIndex: 34, hIndexExclSelf: null };
    expect(qualitySignal(null, null, 1, 0).label).toBe('unknown');
    const s = qualitySignal(null, null, 1, 0, DEFAULT_THRESHOLDS, oa);
    expect(s).toMatchObject({ label: 'balanced', wosShare: null, scopusDocuments: null });
  });
});
