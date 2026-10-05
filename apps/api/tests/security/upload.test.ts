import { describe, it, expect } from 'vitest';
import { sniff, safeDisplayName, storage, ALLOWED_TYPES } from '@/server/evidence/storage';

const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(64)]);
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64),
]);
const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64)]);
const svg = Buffer.from('<svg onload="alert(1)"></svg>');
const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(64)]);

describe('upload type checking', () => {
  it('allows exactly three types, none of them scriptable', () => {
    expect(ALLOWED_TYPES.map((t) => t.ext).sort()).toEqual(['jpg', 'pdf', 'png']);
  });

  it('accepts a real PDF, PNG and JPG', () => {
    expect(sniff(pdf, 'sanction.pdf', ['pdf']).ok).toBe(true);
    expect(sniff(png, 'scan.png', ['pdf', 'png']).ok).toBe(true);
    expect(sniff(jpg, 'scan.jpeg', ['jpg', 'jpeg']).ok).toBe(true);
  });

  it('rejects an executable renamed to .pdf', () => {
    expect(sniff(exe, 'payload.pdf', ['pdf']).ok).toBe(false);
  });

  it('rejects SVG, HTML and ZIP outright', () => {
    expect(sniff(svg, 'logo.svg', ['pdf', 'jpg', 'png']).ok).toBe(false);
    expect(sniff(Buffer.from('<html>'), 'x.html', ['pdf']).ok).toBe(false);
    expect(sniff(zip, 'bomb.zip', ['pdf']).ok).toBe(false);
  });

  it('rejects a PDF offered to a field that only takes images', () => {
    expect(sniff(pdf, 'a.pdf', ['jpg', 'png']).ok).toBe(false);
  });

  it('rejects an empty file', () => {
    expect(sniff(Buffer.alloc(0), 'empty.pdf', ['pdf']).ok).toBe(false);
  });

  it('rejects a mismatched declared MIME type', () => {
    expect(sniff(pdf, 'a.pdf', ['pdf'], 'application/pdf').ok).toBe(true);
    expect(sniff(pdf, 'a.pdf', ['pdf'], 'image/png').ok).toBe(false);
  });

  it('cleans dangerous filenames', () => {
    expect(safeDisplayName('../../etc/passwd')).not.toContain('../');
    expect(safeDisplayName('a\x00b.pdf')).toBe('ab.pdf');
    expect(safeDisplayName('')).toBe('document');
    expect(safeDisplayName('x'.repeat(400)).length).toBe(150);
  });
});

describe('storage keys', () => {
  it('refuses a traversal key', async () => {
    await expect(storage.get('../../../etc/passwd')).rejects.toThrow();
    await expect(storage.get('not-a-uuid.pdf')).rejects.toThrow();
    await expect(storage.get('/etc/passwd')).rejects.toThrow();
    await expect(storage.get('11111111-1111-1111-1111-111111111111/../../x.pdf'))
      .rejects.toThrow();
  });

  it('round-trips a file under a server-generated key only', async () => {
    const stored = await storage.put(pdf, 'pdf');
    expect(stored.storageKey).toMatch(
      /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/,
    );
    expect(stored.sizeBytes).toBe(pdf.length);
    expect(stored.sha256).toMatch(/^[0-9a-f]{64}$/);
    const back = await storage.get(stored.storageKey);
    expect(back.equals(pdf)).toBe(true);
    await storage.remove(stored.storageKey);
    await expect(storage.get(stored.storageKey)).rejects.toThrow();
  });
});
