/** Validates an ISBN-10 or ISBN-13 (checksum) and returns it as 13 bare digits, or null. */
export function isbn13(raw: string): string | null {
  const s = raw.replace(/[\s-]/g, '').toUpperCase();
  const sum13 = (d: string) => [...d].reduce((acc, ch, i) => acc + Number(ch) * (i % 2 === 0 ? 1 : 3), 0);
  if (/^\d{13}$/.test(s)) return sum13(s) % 10 === 0 ? s : null;
  if (/^\d{9}[\dX]$/.test(s)) {
    const sum10 = [...s].reduce((acc, ch, i) => acc + (ch === 'X' ? 10 : Number(ch)) * (10 - i), 0);
    if (sum10 % 11 !== 0) return null;
    const core = `978${s.slice(0, 9)}`;
    return core + String((10 - (sum13(core) % 10)) % 10);
  }
  return null;
}
