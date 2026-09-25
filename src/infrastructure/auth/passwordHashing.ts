import { scrypt as _scrypt, randomBytes, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(_scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: object,
) => Promise<Buffer>;

const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;

/**
 * Hash a password with Node's built-in scrypt (no new dependency). The
 * output is self-describing so the parameters can change later without
 * invalidating hashes already stored: 'scrypt$<N>$<r>$<p>$<saltB64>$<keyB64>'.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LENGTH, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false;
  }
  const [, n, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// A memoised hash of a fixed dummy password, verified against an unknown
// username so a login attempt always costs the same amount of work whether
// or not the account exists — this is what keeps username enumeration off
// the table without any extra logic in the caller.
let dummy: Promise<string> | null = null;
export const dummyPasswordHash = (): Promise<string> =>
  (dummy ??= hashPassword('not-a-real-password'));
