import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { signStaffToken, verifyStaffToken } from '../../src/infrastructure/auth/staffTokens';

describe('staffTokens', () => {
  let prev: string | undefined;

  beforeEach(() => {
    prev = process.env.STAFF_JWT_SECRET;
    process.env.STAFF_JWT_SECRET = 'test-secret-test-secret-test-secret-00';
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.STAFF_JWT_SECRET;
    else process.env.STAFF_JWT_SECRET = prev;
  });

  it('round-trips claims', async () => {
    const now = new Date('2026-09-25T10:00:00.000Z');
    const { token, expiresAt } = await signStaffToken({ staffId: 'st-1', shopId: 'shop-1', role: 'staff' }, now);
    const claims = await verifyStaffToken(token);
    expect(claims).toEqual({ staffId: 'st-1', shopId: 'shop-1', role: 'staff' });
    const expected = new Date(now.getTime() + 43200 * 1000).toISOString();
    expect(Math.abs(Date.parse(expiresAt) - Date.parse(expected))).toBeLessThanOrEqual(1000);
  });

  it('rejects another secret', async () => {
    const now = new Date('2026-09-25T10:00:00.000Z');
    const { token } = await signStaffToken({ staffId: 'st-1', shopId: 'shop-1', role: 'staff' }, now);
    process.env.STAFF_JWT_SECRET = 'other-secret-other-secret-other-00';
    await expect(verifyStaffToken(token)).rejects.toThrow('Authentication required');
  });

  it('rejects expired', async () => {
    const now = new Date(Date.now() - 13 * 3600 * 1000);
    const { token } = await signStaffToken({ staffId: 'st-1', shopId: 'shop-1', role: 'staff' }, now);
    await expect(verifyStaffToken(token)).rejects.toThrow('Authentication required');
  });

  it('refuses to sign without a secret', async () => {
    delete process.env.STAFF_JWT_SECRET;
    await expect(signStaffToken({ staffId: 'st-1', shopId: 'shop-1', role: 'staff' }, new Date())).rejects.toThrow(
      'STAFF_JWT_SECRET is not configured',
    );
  });
});
