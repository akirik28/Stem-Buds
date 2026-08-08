import { describe, expect, it } from 'vitest';
import {
  checkPasswordPolicy,
  generateTemporaryPassword,
  hashPassword,
  safeCompare,
  verifyPassword,
} from '@/server/auth/password';

describe('password hashing', () => {
  it('produces an argon2id hash that does not contain the password', async () => {
    const hash = await hashPassword('Deneme12345');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).not.toContain('Deneme12345');
  });

  it('verifies the correct password and rejects a wrong one', async () => {
    const hash = await hashPassword('Deneme12345');
    await expect(verifyPassword(hash, 'Deneme12345')).resolves.toBe(true);
    await expect(verifyPassword(hash, 'Deneme12346')).resolves.toBe(false);
  });

  it('fails closed on a malformed hash instead of throwing', async () => {
    await expect(verifyPassword('not-a-hash', 'anything')).resolves.toBe(false);
  });

  it('produces a different hash for the same password (per-hash salt)', async () => {
    const [a, b] = await Promise.all([hashPassword('Deneme12345'), hashPassword('Deneme12345')]);
    expect(a).not.toBe(b);
  });
});

describe('temporary passwords', () => {
  it('avoids ambiguous characters', () => {
    for (let index = 0; index < 50; index += 1) {
      expect(generateTemporaryPassword()).not.toMatch(/[0O1lI]/);
    }
  });

  it('is 12 characters long and effectively unique', () => {
    const generated = new Set<string>();
    for (let index = 0; index < 200; index += 1) {
      const value = generateTemporaryPassword();
      expect(value).toHaveLength(12);
      generated.add(value);
    }
    expect(generated.size).toBe(200);
  });
});

describe('password policy', () => {
  it('accepts a reasonable password', () => {
    expect(checkPasswordPolicy('Bahce2026yaz', 'ada')).toEqual({ ok: true });
  });

  it('rejects short passwords', () => {
    expect(checkPasswordPolicy('kisa12', 'ada')).toEqual({ ok: false, reason: 'too_short' });
  });

  it('requires a digit and a letter', () => {
    expect(checkPasswordPolicy('yalnizcaharf', 'ada')).toEqual({
      ok: false,
      reason: 'needs_number',
    });
    expect(checkPasswordPolicy('123456789012', 'ada')).toEqual({
      ok: false,
      reason: 'needs_letter',
    });
  });

  it('rejects a password containing the username, case-insensitively', () => {
    expect(checkPasswordPolicy('AdaSarp2026x', 'adasarp')).toEqual({
      ok: false,
      reason: 'same_as_username',
    });
  });

  it('accepts Turkish letters as letters', () => {
    expect(checkPasswordPolicy('çiğdemöşü12', 'ada')).toEqual({ ok: true });
  });
});

describe('safeCompare', () => {
  it('matches equal strings and rejects different ones', () => {
    expect(safeCompare('token-abc', 'token-abc')).toBe(true);
    expect(safeCompare('token-abc', 'token-abd')).toBe(false);
    expect(safeCompare('short', 'much-longer-value')).toBe(false);
  });
});
