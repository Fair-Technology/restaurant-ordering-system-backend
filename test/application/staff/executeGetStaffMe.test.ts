import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/infrastructure/auth/principal', () => ({ authenticate: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({
  findShopById: vi.fn(),
}));
vi.mock('../../../src/infrastructure/cosmos/staff/CosmosStaffAccountRepository', () => ({
  findStaffAccountById: vi.fn(),
}));

import { authenticate } from '../../../src/infrastructure/auth/principal';
import { findStaffAccountById } from '../../../src/infrastructure/cosmos/staff/CosmosStaffAccountRepository';
import { findShopById } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { executeGetStaffMe } from '../../../src/application/staff/getStaffMe/executeGetStaffMe';

const staffPrincipal = { kind: 'staff', staffId: 'st-1', shopId: 'shop-1', role: 'staff' };
const account = {
  id: 'st-1', shopId: 'shop-1', username: 'kitchen', displayName: null, role: 'staff',
  passwordHash: 'secret', language: 'de', isActive: true, isDeleted: false,
  failedLoginCount: 0, lockedUntil: null, lastLoginAt: null, createdBy: 'o',
  createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
};

describe('executeGetStaffMe', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the own profile with language', async () => {
    (authenticate as any).mockResolvedValue(staffPrincipal);
    (findStaffAccountById as any).mockResolvedValue(account);
    const res = await executeGetStaffMe({} as any);
    expect(findStaffAccountById).toHaveBeenCalledWith('shop-1', 'st-1');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.language).toBe('de');
      expect(res.data.shopId).toBe('shop-1');
      expect(res.data).not.toHaveProperty('passwordHash');
    }
  });

  it.each([
    ['AT', 'de'],
    ['AU', 'en'],
  ])('reports shopLanguage for a shop in %s as %s', async (countryCode, expected) => {
    (authenticate as any).mockResolvedValue(staffPrincipal);
    (findStaffAccountById as any).mockResolvedValue(account);
    (findShopById as any).mockResolvedValue({ id: 'shop-1', countryCode });
    const res = await executeGetStaffMe({} as any);
    expect(findShopById).toHaveBeenCalledWith('shop-1');
    expect(res.ok && res.data.shopLanguage).toBe(expected);
  });

  it('falls back to en when the shop cannot be found', async () => {
    (authenticate as any).mockResolvedValue(staffPrincipal);
    (findStaffAccountById as any).mockResolvedValue(account);
    (findShopById as any).mockResolvedValue(null);
    const res = await executeGetStaffMe({} as any);
    expect(res.ok && res.data.shopLanguage).toBe('en');
  });

  it('refuses an owner (Entra) token', async () => {
    (authenticate as any).mockResolvedValue({ kind: 'entra', userId: 'u' });
    const res = await executeGetStaffMe({} as any);
    expect(!res.ok && res.code).toBe('FORBIDDEN');
    expect(findStaffAccountById).not.toHaveBeenCalled();
  });

  it('missing or deleted account is NOT_FOUND', async () => {
    (authenticate as any).mockResolvedValue(staffPrincipal);
    (findStaffAccountById as any).mockResolvedValue(null);
    expect((await executeGetStaffMe({} as any) as any).code).toBe('NOT_FOUND');
    (findStaffAccountById as any).mockResolvedValue({ ...account, isDeleted: true });
    expect((await executeGetStaffMe({} as any) as any).code).toBe('NOT_FOUND');
  });
});
