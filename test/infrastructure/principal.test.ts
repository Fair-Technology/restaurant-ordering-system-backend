import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpRequest } from '@azure/functions';
import { authenticate } from '../../src/infrastructure/auth/principal';
import { signStaffToken } from '../../src/infrastructure/auth/staffTokens';

function requestWithToken(token: string | null): HttpRequest {
  return {
    headers: new Headers(token ? { authorization: `Bearer ${token}` } : {}),
  } as unknown as HttpRequest;
}

describe('authenticate', () => {
  let prev: string | undefined;

  beforeEach(() => {
    prev = process.env.STAFF_JWT_SECRET;
    process.env.STAFF_JWT_SECRET = 'test-secret-test-secret-test-secret-00';
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.STAFF_JWT_SECRET;
    else process.env.STAFF_JWT_SECRET = prev;
    vi.useRealTimers();
  });

  it('staff token becomes a staff principal', async () => {
    // Freeze the clock at signing time — `authenticate` verifies the token
    // via `jwtVerify`, whose expiry check reads the real system clock, not
    // the `now` passed to sign.
    const now = new Date('2026-09-25T10:00:00.000Z');
    vi.useFakeTimers({ now });
    const { token } = await signStaffToken({ staffId: 'st-1', shopId: 'shop-1', role: 'staff' }, now);
    const principal = await authenticate(requestWithToken(token));
    expect(principal).toEqual({ kind: 'staff', staffId: 'st-1', shopId: 'shop-1', role: 'staff' });
  });

  it('missing header', async () => {
    await expect(authenticate(requestWithToken(null))).rejects.toThrow('Authentication required');
  });

  it('garbage token', async () => {
    await expect(authenticate(requestWithToken('not-a-jwt'))).rejects.toThrow('Authentication required');
  });
});
