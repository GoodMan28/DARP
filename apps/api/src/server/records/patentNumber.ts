/**
 * Normalises a patent number so that one patent typed two ways collides in the duplicate guard.
 * India formats (verified 2026-10-06):
 *   new application YYYYJTNNNNNN (J office 1-4, T type 1-9), e.g. 202331012345
 *   old application 935/KOL/2013, …/DELNP/…
 *   grant number    6 digits, e.g. 436472
 * TEMP/E-1 numbers are filing receipts only and are refused.
 */
export function normalisePatentNumber(raw: string, country: string): { value: string } | { error: string } {
  const s = raw.trim().toUpperCase().replace(/\s+/g, '').replace(/\\/g, '/');
  if (/^TEMP\//.test(s)) {
    return { error: 'A TEMP/E-1 number is only a filing receipt. Enter the application number (for example 202331012345).' };
  }
  if (country === 'India') {
    let m = s.match(/^(?:IN)?(20\d{2}[1-4][1-9]\d{6})(?:A\d?)?$/);
    if (m) return { value: m[1]! };
    m = s.match(/^(\d{1,6})\/(DEL|MUM|KOL|CHE)(NP)?\/((?:19|20)\d{2})$/);
    if (m) return { value: `${Number(m[1])}/${m[2]}${m[3] ?? ''}/${m[4]}` };
    m = s.match(/^(?:IN)?(\d{6})B?$/);
    if (m) return { value: m[1]! };
    return { error: 'Indian patent numbers look like 202331012345 (application), 935/KOL/2013 (older application) or 436472 (patent number).' };
  }
  return { value: s.replace(/,/g, '') };
}
