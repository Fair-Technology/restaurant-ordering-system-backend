import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpRequest } from '@azure/functions';

vi.mock('../../../src/infrastructure/auth/authHelpers', () => ({
  getPrincipalFromAuth: vi.fn(),
}));
vi.mock('../../../src/infrastructure/auth/superAdminAuthHelpers', () => ({
  isSuperAdminPrincipal: vi.fn(),
}));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({
  findShopsByMemberId: vi.fn(),
}));
vi.mock('../../../src/infrastructure/cosmos/user/CosmosUserRepository', () => ({
  findUserById: vi.fn(),
  upsertUser: vi.fn(),
}));

import { getPrincipalFromAuth } from '../../../src/infrastructure/auth/authHelpers';
import { isSuperAdminPrincipal } from '../../../src/infrastructure/auth/superAdminAuthHelpers';
import { findUserById, upsertUser } from '../../../src/infrastructure/cosmos/user/CosmosUserRepository';
import { findShopsByMemberId } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { executeGetMe } from '../../../src/application/user/getMe/executeGetMe';

const http = {} as HttpRequest;

const operator = { kind: 'entra', userId: 'staff-1', email: 'op@example.com', name: 'Operator', issuer: 'platform', roles: ['Platform.Owner'] };
const customer = { kind: 'entra', userId: 'cust-1', email: 'owner@example.com', name: 'Owner', issuer: 'customer', roles: [] };

describe('executeGetMe', () => {
  beforeEach(() => {
    vi.mocked(getPrincipalFromAuth).mockReset();
    vi.mocked(isSuperAdminPrincipal).mockReset();
    vi.mocked(findUserById).mockReset();
    vi.mocked(upsertUser).mockReset();
    vi.mocked(findShopsByMemberId).mockReset();
    vi.mocked(findShopsByMemberId).mockResolvedValue([]);
  });

  it('reports a platform operator as superadmin and writes no profile for them', async () => {
    vi.mocked(getPrincipalFromAuth).mockResolvedValue(operator as never);
    vi.mocked(isSuperAdminPrincipal).mockResolvedValue(true);
    vi.mocked(findUserById).mockResolvedValue(null);

    const res = await executeGetMe(http);

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.id).toBe('staff-1');
      expect(res.data.email).toBe('op@example.com');
    }
    // The console gates on this reply, so it must not depend on a stored row.
    expect(upsertUser).not.toHaveBeenCalled();
  });

  it('keeps an existing profile timestamps when one is present', async () => {
    vi.mocked(getPrincipalFromAuth).mockResolvedValue(operator as never);
    vi.mocked(isSuperAdminPrincipal).mockResolvedValue(true);
    vi.mocked(findUserById).mockResolvedValue({
      id: 'staff-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-02-02T00:00:00.000Z',
    } as never);

    const res = await executeGetMe(http);

    expect(res.ok && res.data.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(res.ok && res.data.updatedAt).toBe('2026-02-02T00:00:00.000Z');
  });

  it('still creates and reports a normal profile for an app user', async () => {
    vi.mocked(getPrincipalFromAuth).mockResolvedValue(customer as never);
    vi.mocked(isSuperAdminPrincipal).mockResolvedValue(false);
    vi.mocked(upsertUser).mockResolvedValue({
      id: 'cust-1',
      email: 'owner@example.com',
      name: 'Owner',
      language: 'de',
      createdAt: '2026-03-03T00:00:00.000Z',
      updatedAt: '2026-03-03T00:00:00.000Z',
    } as never);

    const res = await executeGetMe(http);

    expect(res.ok && res.data.id).toBe('cust-1');
    expect(res.ok && res.data.language).toBe('de');
    expect(upsertUser).toHaveBeenCalledTimes(1);
  });

  it('refuses an unauthenticated caller', async () => {
    vi.mocked(getPrincipalFromAuth).mockRejectedValue(new Error('Authentication required'));

    const res = await executeGetMe(http);

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('FORBIDDEN');
  });

  it('reports an unexpected failure as an internal error', async () => {
    vi.mocked(getPrincipalFromAuth).mockRejectedValue(new Error('cosmos exploded'));

    const res = await executeGetMe(http);

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('INTERNAL_ERROR');
  });

  it.each([
    [['Platform.Owner'], 'write'],
    [['Platform.Support'], 'write'],
    [['Platform.ReadOnly'], 'read'],
  ])('reports platformAccess for roles %j as %s, from the token', async (roles, level) => {
    vi.mocked(getPrincipalFromAuth).mockResolvedValue({ ...operator, roles } as never);
    vi.mocked(findUserById).mockResolvedValue(null);

    const res = await executeGetMe(http);

    expect(res.ok && res.data.platformAccess).toBe(level);
    expect(upsertUser).not.toHaveBeenCalled();
  });

  it('reports no platformAccess for an app user', async () => {
    vi.mocked(getPrincipalFromAuth).mockResolvedValue(customer as never);
    vi.mocked(upsertUser).mockResolvedValue({ id: 'cust-1', createdAt: 'a', updatedAt: 'b' } as never);

    const res = await executeGetMe(http);

    expect(res.ok && res.data.platformAccess).toBeUndefined();
  });

  describe('restaurantLanguage', () => {
    const profile = { id: 'cust-1', createdAt: 'a', updatedAt: 'b' } as never;
    const shopIn = (countryCode: string, createdAt: string) => ({ id: createdAt, countryCode, createdAt }) as never;

    beforeEach(() => {
      vi.mocked(getPrincipalFromAuth).mockResolvedValue(customer as never);
      vi.mocked(upsertUser).mockResolvedValue(profile);
    });

    it('is de for a single DE shop', async () => {
      vi.mocked(findShopsByMemberId).mockResolvedValue([shopIn('DE', '2026-01-01T00:00:00.000Z')]);
      const res = await executeGetMe(http);
      expect(res.ok && res.data.restaurantLanguage).toBe('de');
    });

    it('is en for a single AU shop', async () => {
      vi.mocked(findShopsByMemberId).mockResolvedValue([shopIn('AU', '2026-01-01T00:00:00.000Z')]);
      const res = await executeGetMe(http);
      expect(res.ok && res.data.restaurantLanguage).toBe('en');
    });

    it('uses the earliest shop when there are several', async () => {
      vi.mocked(findShopsByMemberId).mockResolvedValue([
        shopIn('AU', '2026-05-01T00:00:00.000Z'),
        shopIn('DE', '2026-01-01T00:00:00.000Z'),
      ]);
      const res = await executeGetMe(http);
      expect(res.ok && res.data.restaurantLanguage).toBe('de');
    });

    it('is absent for an owner with no shop', async () => {
      vi.mocked(findShopsByMemberId).mockResolvedValue([]);
      const res = await executeGetMe(http);
      expect(res.ok).toBe(true);
      expect(res.ok && res.data.restaurantLanguage).toBeUndefined();
    });

    it('is absent for a platform operator, without looking up shops', async () => {
      vi.mocked(getPrincipalFromAuth).mockResolvedValue(operator as never);
      vi.mocked(findUserById).mockResolvedValue(null);
      const res = await executeGetMe(http);
      expect(res.ok && res.data.restaurantLanguage).toBeUndefined();
      expect(findShopsByMemberId).not.toHaveBeenCalled();
    });
  });
});
