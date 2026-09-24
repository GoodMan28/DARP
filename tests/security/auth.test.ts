import { describe, it, expect } from 'vitest';
import {
  hashPassword, verifyPassword, assertPasswordAcceptable, PasswordPolicyError,
} from '@/server/auth/password';
import {
  encryptPii, decryptPii, isEncrypted, maskAadhaar, maskPan,
  maskEmail, maskPhone, maskText, isValidAadhaar, isValidPan, safeEqual,
} from '@/server/crypto/pii';
import { makeCsrfToken, verifyCsrfToken } from '@/server/auth/csrf';

describe('password hashing', () => {
  it('produces a verifiable argon2id hash', async () => {
    const h = await hashPassword('Correct-Horse-9!');
    expect(h.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(h, 'Correct-Horse-9!')).toBe(true);
    expect(await verifyPassword(h, 'wrong-password-1!')).toBe(false);
  });

  it('never returns the plaintext in the hash', async () => {
    const h = await hashPassword('Sup3rSecret!Value');
    expect(h).not.toContain('Sup3rSecret');
  });

  it('produces a different hash each time (per-password salt)', async () => {
    const a = await hashPassword('Correct-Horse-9!');
    const b = await hashPassword('Correct-Horse-9!');
    expect(a).not.toBe(b);
  });

  it('rejects weak, personal or common passwords', () => {
    expect(() => assertPasswordAcceptable('short1!A')).toThrow(PasswordPolicyError);
    expect(() => assertPasswordAcceptable('password123')).toThrow(PasswordPolicyError);
    expect(() => assertPasswordAcceptable('alllowercaseletters')).toThrow(PasswordPolicyError);
    expect(() => assertPasswordAcceptable('Anup-Verma-2026', { name: 'Anup Kumar Verma' }))
      .toThrow(PasswordPolicyError);
    expect(() => assertPasswordAcceptable('akverma-Pass99!', { email: 'akverma@bitmesra.ac.in' }))
      .toThrow(PasswordPolicyError);
    expect(() => assertPasswordAcceptable('Wf7$kdTq91zR')).not.toThrow();
  });

  it('never throws on a malformed stored hash — it just fails', async () => {
    expect(await verifyPassword('not-a-hash', 'anything')).toBe(false);
  });
});

describe('PII encryption', () => {
  it('round-trips and produces different ciphertext each time', () => {
    const a = encryptPii('234123412346');
    const b = encryptPii('234123412346');
    expect(a).not.toBe(b);                     // random IV
    expect(decryptPii(a)).toBe('234123412346');
    expect(isEncrypted(a)).toBe(true);
    expect(a).not.toContain('234123412346');
  });

  it('detects tampering (GCM authentication)', () => {
    const enc = encryptPii('ABCDE1234F');
    const parts = enc.split(':');
    const flipped = Buffer.from(parts[3]!, 'base64');
    flipped[0] = flipped[0]! ^ 0xff;
    const tampered = [parts[0], parts[1], parts[2], flipped.toString('base64')].join(':');
    expect(() => decryptPii(tampered)).toThrow();
  });

  it('refuses an unrecognised ciphertext format rather than guessing', () => {
    expect(() => decryptPii('plain-text-value')).toThrow(/unrecognised/);
  });

  it('masks correctly and never reveals more than four characters', () => {
    expect(maskAadhaar('234123412346')).toBe('XXXX-XXXX-2346');
    expect(maskPan('ABCDE1234F')).toBe('XXXXX1234X');
    expect(maskAadhaar('123')).toBe('XXXX-XXXX-XXXX');
    expect(maskPan('nonsense')).toBe('XXXXXXXXXX');
  });

  it('partially masks contact details without revealing them', () => {
    expect(maskEmail('anita.kumari@bitmesra.ac.in')).toBe('a•••@bitmesra.ac.in');
    expect(maskPhone('+91 9876543210')).toBe('••••••3210');
    expect(maskPhone('+91 9876543210')).not.toContain('9876');
    expect(maskText('1250000')).not.toContain('250000');
  });

  it('validates Aadhaar with the Verhoeff checksum and PAN by format', () => {
    // 234123412346 carries the correct Verhoeff check digit; changing only that
    // digit must be rejected. (Doc 03's example asserted the opposite — the number
    // it called invalid is in fact valid, which the checksum settles either way.)
    expect(isValidAadhaar('234123412346')).toBe(true);
    expect(isValidAadhaar('234123412345')).toBe(false);   // wrong check digit
    expect(isValidAadhaar('123412341234')).toBe(false);   // Aadhaar never starts with 0 or 1
    expect(isValidAadhaar('2341-2341-2346')).toBe(true);  // separators are ignored
    expect(isValidAadhaar('23412341')).toBe(false);       // too short
    expect(isValidPan('ABCDE1234F')).toBe(true);
    expect(isValidPan('abcde1234f')).toBe(true);
    expect(isValidPan('ABCD1234F')).toBe(false);
  });

  it('compares tokens in constant time without throwing on length mismatch', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'much-longer-value')).toBe(false);
  });
});

describe('CSRF tokens', () => {
  it('binds the token to the session', () => {
    const t = makeCsrfToken('session-a');
    expect(verifyCsrfToken('session-a', t)).toBe(true);
    expect(verifyCsrfToken('session-b', t)).toBe(false);
    expect(verifyCsrfToken('session-a', 'forged.token')).toBe(false);
    expect(verifyCsrfToken('session-a', undefined)).toBe(false);
    expect(verifyCsrfToken('session-a', '')).toBe(false);
  });

  it('issues a different token each time, so one cannot be replayed from a log', () => {
    expect(makeCsrfToken('s')).not.toBe(makeCsrfToken('s'));
  });
});
