import { randomInt, timingSafeEqual } from 'node:crypto';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';

/**
 * Password handling.
 *
 * Hashing uses argon2id from a maintained native library — no home-grown
 * cryptography, and raw or temporary passwords are never persisted anywhere.
 */

const ARGON_OPTIONS = {
  // OWASP-recommended argon2id baseline: 19 MiB, 2 iterations, parallelism 1.
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

/** Characters chosen so a temporary password can be read aloud without ambiguity. */
const TEMP_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const TEMP_PASSWORD_LENGTH = 12;

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;

export async function hashPassword(plainPassword: string): Promise<string> {
  return argonHash(plainPassword, ARGON_OPTIONS);
}

export async function verifyPassword(storedHash: string, plainPassword: string): Promise<boolean> {
  try {
    return await argonVerify(storedHash, plainPassword);
  } catch {
    // A malformed hash must fail closed rather than throw into the login route.
    return false;
  }
}

/**
 * Generates a temporary password. The value is returned to the administrator
 * exactly once, at creation or reset time, and is never stored or e-mailed by
 * the platform.
 */
export function generateTemporaryPassword(): string {
  let result = '';
  for (let index = 0; index < TEMP_PASSWORD_LENGTH; index += 1) {
    result += TEMP_PASSWORD_ALPHABET[randomInt(TEMP_PASSWORD_ALPHABET.length)];
  }
  return result;
}

export type PasswordPolicyResult = { ok: true } | { ok: false; reason: PasswordPolicyFailure };

export type PasswordPolicyFailure =
  | 'too_short'
  | 'too_long'
  | 'needs_letter'
  | 'needs_number'
  | 'same_as_username';

/**
 * Minimum strength required when a user chooses their own password.
 * Deliberately simple: length first, then one letter and one digit.
 */
export function checkPasswordPolicy(password: string, username: string): PasswordPolicyResult {
  if (password.length < MIN_PASSWORD_LENGTH) return { ok: false, reason: 'too_short' };
  if (password.length > MAX_PASSWORD_LENGTH) return { ok: false, reason: 'too_long' };
  if (!/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(password)) return { ok: false, reason: 'needs_letter' };
  if (!/[0-9]/.test(password)) return { ok: false, reason: 'needs_number' };
  if (password.toLocaleLowerCase('tr').includes(username.toLocaleLowerCase('tr'))) {
    return { ok: false, reason: 'same_as_username' };
  }
  return { ok: true };
}

/** Constant-time comparison for short secrets such as bootstrap tokens. */
export function safeCompare(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
