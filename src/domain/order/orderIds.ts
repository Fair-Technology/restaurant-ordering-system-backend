import { createHash, randomBytes, timingSafeEqual } from 'crypto';

export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

/** The same shop and key always give the same order id, so a double click can never make two orders. */
export function orderIdForIdempotencyKey(shopId: string, key: string): string {
  return createHash('sha256').update(`${shopId}:${key}`).digest('hex').slice(0, 32);
}

export function generateAccessToken(): string {
  return randomBytes(24).toString('base64url');
}

export function accessTokenMatches(stored: string | undefined, given: unknown): boolean {
  if (typeof given !== 'string' || !stored || given.length !== stored.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(stored));
}
