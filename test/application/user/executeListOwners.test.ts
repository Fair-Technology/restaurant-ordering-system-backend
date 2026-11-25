import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/infrastructure/auth/superAdminAuthHelpers', () => ({ requirePlatform: vi.fn(async () => 'u1') }));
vi.mock('../../../src/infrastructure/cosmos/user/CosmosUserRepository', () => ({ findUsers: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({ findOwnedShopIds: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/system/CosmosSystemConfigRepository', () => ({
  getSystemConfig: vi.fn(async () => ({ id: 'global', maxShopsDefault: 3 })),
}));

import { requirePlatform } from '../../../src/infrastructure/auth/superAdminAuthHelpers';
import { findUsers } from '../../../src/infrastructure/cosmos/user/CosmosUserRepository';
import { findOwnedShopIds } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { executeListOwners } from '../../../src/application/user/listOwners/executeListOwners';

const user = (id: string, extra: Record<string, unknown> = {}) => ({
  id, email: `${id}@x.com`, name: id.toUpperCase(), createdAt: '', updatedAt: '', ...extra,
});

describe('executeListOwners', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (requirePlatform as any).mockResolvedValue('u1');
    (findUsers as any).mockResolvedValue({ users: [], total: 0 });
    (findOwnedShopIds as any).mockResolvedValue([]);
  });

  it('refuses callers without platform access', async () => {
    (requirePlatform as any).mockResolvedValueOnce(null);
    expect(await executeListOwners({}, {} as any)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(findUsers).not.toHaveBeenCalled();
  });

  it('asks for read-level platform access', async () => {
    await executeListOwners({}, {} as any);
    expect(requirePlatform).toHaveBeenCalledWith(expect.anything(), 'read');
  });

  it('includes an owner with no shops with shopCount 0', async () => {
    (findUsers as any).mockResolvedValue({ users: [user('a')], total: 1 });
    const r: any = await executeListOwners({}, {} as any);
    expect(r.data.owners).toEqual([
      { userId: 'a', email: 'a@x.com', name: 'A', maxShops: null, effectiveLimit: 3, shopCount: 0 },
    ]);
  });

  it('counts exactly what findOwnedShopIds returns (soft-deleted excluded there, paused/offlined included)', async () => {
    (findUsers as any).mockResolvedValue({ users: [user('a', { maxShops: 5 })], total: 1 });
    // findOwnedShopIds already applies isDeleted=false; a paused and an offlined shop are still returned.
    (findOwnedShopIds as any).mockResolvedValue(['live', 'paused', 'offlined']);
    const r: any = await executeListOwners({}, {} as any);
    expect(findOwnedShopIds).toHaveBeenCalledWith('a');
    expect(r.data.owners[0]).toMatchObject({ shopCount: 3, maxShops: 5, effectiveLimit: 5 });
  });

  it('resolves effectiveLimit: override (incl. -1) wins, else global default', async () => {
    (findUsers as any).mockResolvedValue({
      users: [user('a'), user('b', { maxShops: -1 }), user('c', { maxShops: 7 })],
      total: 3,
    });
    const r: any = await executeListOwners({}, {} as any);
    expect(r.data.owners.map((o: any) => o.effectiveLimit)).toEqual([3, -1, 7]);
  });

  it('passes a trimmed search through to the repository', async () => {
    await executeListOwners({ search: '  Bob ' }, {} as any);
    expect(findUsers).toHaveBeenCalledWith('Bob', 1, 20);
    await executeListOwners({ search: '   ' }, {} as any);
    expect(findUsers).toHaveBeenLastCalledWith(undefined, 1, 20);
  });

  it('clamps paging and returns page, pageSize and total', async () => {
    (findUsers as any).mockResolvedValue({ users: [user('a')], total: 42 });
    const r: any = await executeListOwners({ page: 0, pageSize: 500 }, {} as any);
    expect(findUsers).toHaveBeenCalledWith(undefined, 1, 100);
    expect(r.data).toMatchObject({ page: 1, pageSize: 100, total: 42 });
    const r2: any = await executeListOwners({ page: 3, pageSize: 10 }, {} as any);
    expect(findUsers).toHaveBeenLastCalledWith(undefined, 3, 10);
    expect(r2.data).toMatchObject({ page: 3, pageSize: 10 });
  });

  it('returns INTERNAL_ERROR when the repository throws', async () => {
    (findUsers as any).mockRejectedValueOnce(new Error('boom'));
    expect(await executeListOwners({}, {} as any)).toMatchObject({ ok: false, code: 'INTERNAL_ERROR' });
  });
});
