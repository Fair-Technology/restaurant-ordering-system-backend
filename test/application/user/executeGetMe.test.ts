import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpRequest } from '@azure/functions';

vi.mock('../../../src/infrastructure/auth/authHelpers', () => ({
  getPrincipalFromAuth: vi.fn(),
}));
vi.mock('../../../src/infrastructure/auth/superAdminAuthHelpers', () => ({
  isSuperAdminPrincipal: vi.fn(),
}));
vi.mock('../../../src/infrastructure/cosmos/user/CosmosUserRepository', () => ({
  findUserById: vi.fn(),
  upsertUser: vi.fn(),
}));

import { getPrincipalFromAuth } from '../../../src/infrastructure/auth/authHelpers';
import { isSuperAdminPrincipal } from '../../../src/infrastructure/auth/superAdminAuthHelpers';
import { findUserById, upsertUser } from '../../../src/infrastructure/cosmos/user/CosmosUserRepository';
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
  });

  it('reports a platform operator as superadmin and writes no profile for them', async () => {
    vi.mocked(getPrincipalFromAuth).mockResolvedValue(operator as never);
    vi.mocked(isSuperAdminPrincipal).mockResolvedValue(true);
    vi.mocked(findUserById).mockResolvedValue(null);

    const res = await executeGetMe(http);

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.systemRole).toBe('superadmin');
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
      systemRole: 'superadmin',
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
      systemRole: 'user',
      createdAt: '2026-03-03T00:00:00.000Z',
      updatedAt: '2026-03-03T00:00:00.000Z',
    } as never);

    const res = await executeGetMe(http);

    expect(res.ok && res.data.systemRole).toBe('user');
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
    expect(res.ok && res.data.systemRole).toBe('superadmin');
    expect(upsertUser).not.toHaveBeenCalled();
  });

  it('reports no platformAccess for an app user', async () => {
    vi.mocked(getPrincipalFromAuth).mockResolvedValue(customer as never);
    vi.mocked(upsertUser).mockResolvedValue({ id: 'cust-1', systemRole: 'user', createdAt: 'a', updatedAt: 'b' } as never);

    const res = await executeGetMe(http);

    expect(res.ok && res.data.platformAccess).toBeUndefined();
  });
});
