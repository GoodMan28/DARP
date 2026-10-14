import type { TextItem } from './patentJournal';

/**
 * The positioned text of every page of a PDF, one page at a time (a journal part runs to 1,000
 * pages; holding them all would cost memory for nothing). Uses pdf.js, which is plain JavaScript,
 * so the server needs no PDF tools installed.
 */
export async function* pdfPages(bytes: Uint8Array): AsyncGenerator<TextItem[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data: bytes, verbosity: 0, isEvalSupported: false, disableFontFace: true, useSystemFonts: false,
  }).promise;
  try {
    for (let n = 1; n <= doc.numPages; n += 1) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const items: TextItem[] = [];
      for (const it of content.items) {
        if (!('str' in it) || !it.str.trim()) continue;
        items.push({ x: it.transform[4] as number, y: it.transform[5] as number, w: it.width, s: it.str });
      }
      page.cleanup();
      yield items;
      // Reading runs on the API's own thread: let waiting requests in between pages.
      await new Promise((r) => setImmediate(r));
    }
  } finally {
    await doc.destroy();
  }
}
