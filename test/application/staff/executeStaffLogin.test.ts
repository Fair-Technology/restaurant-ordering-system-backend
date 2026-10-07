import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({
  findShopBySlug: vi.fn(),
}));
vi.mock('../../../src/infrastructure/cosmos/staff/CosmosStaffAccountRepository', () => ({
  findStaffAccountByUsername: vi.fn(),
  replaceStaffAccount: vi.fn(),
  listStaffAccounts: vi.fn(),
}));
vi.mock('../../../src/application/_shared/entitlements', () => ({
  loadEntitlements: vi.fn(async () => ({ planId: 'plan-basic', limits: { STAFF_ACCOUNTS: 5 }, limitOverrideActive: false, planOverrideExpired: false })),
}));

import { findShopBySlug } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import {
  findStaffAccountByUsername,
  listStaffAccounts,
  replaceStaffAccount,
} from '../../../src/infrastructure/cosmos/staff/CosmosStaffAccountRepository';
import { loadEntitlements } from '../../../src/application/_shared/entitlements';
import { hashPassword } from '../../../src/infrastructure/auth/passwordHashing';
import { executeStaffLogin } from '../../../src/application/staff/staffLogin/executeStaffLogin';
import { StaffAccount } from '../../../src/domain/staff/StaffAccount';
import { Shop } from '../../../src/domain/shop/Shop';

const shop = { id: 'shop-1', slug: 'pizzeria-kreuzberg' } as unknown as Shop;

let hash: string;

const baseAccount: StaffAccount = {
  id: 'st-1',
  shopId: 'shop-1',
  username: 'kitchen',
  displayName: null,
  role: 'staff',
  passwordHash: '',
  isActive: true,
  isDeleted: false,
  failedLoginCount: 0,
  lockedUntil: null,
  lastLoginAt: null,
  createdBy: 'owner-1',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

describe('executeStaffLogin', () => {
  let prev: string | undefined;
  const now = new Date('2026-09-25T10:00:00.000Z');

  beforeAll(async () => {
    hash = await hashPassword('kitchen-pass-1');
  });

  beforeEach(() => {
    prev = process.env.STAFF_JWT_SECRET;
    process.env.STAFF_JWT_SECRET = 'test-secret-test-secret-test-secret-00';
    vi.clearAllMocks();
    (findShopBySlug as any).mockResolvedValue(shop);
    (replaceStaffAccount as any).mockImplementation(async (a: StaffAccount) => a);
    (listStaffAccounts as any).mockResolvedValue([{ ...baseAccount }]);
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.STAFF_JWT_SECRET;
    else process.env.STAFF_JWT_SECRET = prev;
  });

  it('signs in', async () => {
    (findStaffAccountByUsername as any).mockResolvedValue({ ...baseAccount, passwordHash: hash });
    const result = await executeStaffLogin(
      { shopSlug: 'pizzeria-kreuzberg', username: 'kitchen', password: 'kitchen-pass-1' },
      now,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.role).toBe('staff');
      expect(result.data.shopSlug).toBe('pizzeria-kreuzberg');
    }
    expect(replaceStaffAccount).toHaveBeenCalledWith(
      expect.objectContaining({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: '2026-09-25T10:00:00.000Z' }),
    );
  });

  it('wrong password counts', async () => {
    (findStaffAccountByUsername as any).mockResolvedValue({ ...baseAccount, passwordHash: hash });
    const result = await executeStaffLogin(
      { shopSlug: 'pizzeria-kreuzberg', username: 'kitchen', password: 'wrong-pass' },
      now,
    );
    expect(result).toEqual({ ok: false, code: 'FORBIDDEN', error: 'INVALID_CREDENTIALS' });
    expect(replaceStaffAccount).toHaveBeenCalledWith(
      expect.objectContaining({ failedLoginCount: 1, lockedUntil: null }),
    );
  });

  it('fifth failure locks', async () => {
    (findStaffAccountByUsername as any).mockResolvedValue({
      ...baseAccount,
      passwordHash: hash,
      failedLoginCount: 4,
    });
    await executeStaffLogin({ shopSlug: 'pizzeria-kreuzberg', username: 'kitchen', password: 'wrong-pass' }, now);
    expect(replaceStaffAccount).toHaveBeenCalledWith(
      expect.objectContaining({ failedLoginCount: 5, lockedUntil: '2026-09-25T10:15:00.000Z' }),
    );
  });

  it('locked account refused even with right password', async () => {
    (findStaffAccountByUsername as any).mockResolvedValue({
      ...baseAccount,
      passwordHash: hash,
      lockedUntil: '2026-09-25T10:05:00.000Z',
    });
    const result = await executeStaffLogin(
      { shopSlug: 'pizzeria-kreuzberg', username: 'kitchen', password: 'kitchen-pass-1' },
      now,
    );
    expect(result).toEqual({ ok: false, code: 'FORBIDDEN', error: 'ACCOUNT_LOCKED' });
    expect(replaceStaffAccount).not.toHaveBeenCalled();
  });

  it('expired lock allows sign-in', async () => {
    (findStaffAccountByUsername as any).mockResolvedValue({
      ...baseAccount,
      passwordHash: hash,
      failedLoginCount: 5,
      lockedUntil: '2026-09-25T09:59:00.000Z',
    });
    const result = await executeStaffLogin(
      { shopSlug: 'pizzeria-kreuzberg', username: 'kitchen', password: 'kitchen-pass-1' },
      now,
    );
    expect(result.ok).toBe(true);
    expect(replaceStaffAccount).toHaveBeenCalledWith(
      expect.objectContaining({ failedLoginCount: 0, lockedUntil: null }),
    );
  });

  it('wrong password after expired lock restarts count', async () => {
    (findStaffAccountByUsername as any).mockResolvedValue({
      ...baseAccount,
      passwordHash: hash,
      failedLoginCount: 5,
      lockedUntil: '2026-09-25T09:59:00.000Z',
    });
    await executeStaffLogin({ shopSlug: 'pizzeria-kreuzberg', username: 'kitchen', password: 'wrong-pass' }, now);
    expect(replaceStaffAccount).toHaveBeenCalledWith(
      expect.objectContaining({ failedLoginCount: 1, lockedUntil: null }),
    );
  });

  it('unknown user', async () => {
    (findStaffAccountByUsername as any).mockResolvedValue(null);
    const result = await executeStaffLogin(
      { shopSlug: 'pizzeria-kreuzberg', username: 'nobody', password: 'kitchen-pass-1' },
      now,
    );
    expect(result).toEqual({ ok: false, code: 'FORBIDDEN', error: 'INVALID_CREDENTIALS' });
    expect(replaceStaffAccount).not.toHaveBeenCalled();
  });

  it('inactive user', async () => {
    (findStaffAccountByUsername as any).mockResolvedValue({ ...baseAccount, passwordHash: hash, isActive: false });
    const result = await executeStaffLogin(
      { shopSlug: 'pizzeria-kreuzberg', username: 'kitchen', password: 'kitchen-pass-1' },
      now,
    );
    expect(result).toEqual({ ok: false, code: 'FORBIDDEN', error: 'INVALID_CREDENTIALS' });
  });

  it('unknown restaurant', async () => {
    (findShopBySlug as any).mockResolvedValue(null);
    const result = await executeStaffLogin(
      { shopSlug: 'no-such-shop', username: 'kitchen', password: 'kitchen-pass-1' },
      now,
    );
    expect(result).toEqual({ ok: false, code: 'FORBIDDEN', error: 'INVALID_CREDENTIALS' });
    expect(findStaffAccountByUsername).not.toHaveBeenCalled();
  });

  it('username is case-insensitive', async () => {
    (findStaffAccountByUsername as any).mockResolvedValue({ ...baseAccount, passwordHash: hash });
    await executeStaffLogin({ shopSlug: 'pizzeria-kreuzberg', username: 'Kitchen', password: 'kitchen-pass-1' }, now);
    expect(findStaffAccountByUsername).toHaveBeenCalledWith('shop-1', 'kitchen');
  });

  describe('staff seats', () => {
    const st2 = { ...baseAccount, id: 'st-2', username: 'bar', createdAt: '2026-09-02T00:00:00.000Z' };
    const st3 = { ...baseAccount, id: 'st-3', username: 'foo', createdAt: '2026-09-03T00:00:00.000Z' };

    beforeEach(() => {
      (listStaffAccounts as any).mockResolvedValue([baseAccount, st2, st3]);
      (loadEntitlements as any).mockResolvedValueOnce({
        planId: 'plan-basic',
        limits: { STAFF_ACCOUNTS: 2 },
        limitOverrideActive: false,
        planOverrideExpired: false,
      });
    });

    it('a login beyond the seat count is suspended', async () => {
      (findStaffAccountByUsername as any).mockResolvedValue({ ...st3, passwordHash: hash });
      const result = await executeStaffLogin({ shopSlug: 'pizzeria-kreuzberg', username: 'foo', password: 'kitchen-pass-1' }, now);
      expect(result).toEqual({ ok: false, code: 'FORBIDDEN', error: 'SEAT_SUSPENDED' });
      expect(replaceStaffAccount).not.toHaveBeenCalled();
    });

    it('the oldest logins still sign in', async () => {
      (findStaffAccountByUsername as any).mockResolvedValue({ ...baseAccount, passwordHash: hash });
      const result = await executeStaffLogin({ shopSlug: 'pizzeria-kreuzberg', username: 'kitchen', password: 'kitchen-pass-1' }, now);
      expect(result.ok).toBe(true);
    });
  });
});
