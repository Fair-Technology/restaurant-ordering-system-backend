import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpRequest } from '@azure/functions';

vi.mock('../../src/infrastructure/cosmos/cosmosClient');
vi.mock('../../src/infrastructure/cosmos/audit/CosmosAuditRepository', async (io) => ({
  ...(await io<object>()),
  findAuditEntriesByShop: vi.fn(),
  findDistinctAuditActors: vi.fn(),
}));
vi.mock('../../src/infrastructure/cosmos/shop/CosmosShopRepository', async (io) => ({
  ...(await io<object>()),
  findShopById: vi.fn(),
}));
vi.mock('../../src/infrastructure/cosmos/user/CosmosUserRepository', async (io) => ({
  ...(await io<object>()),
  findUserById: vi.fn(),
}));
vi.mock('../../src/infrastructure/cosmos/staff/CosmosStaffAccountRepository', async (io) => ({
  ...(await io<object>()),
  findStaffAccountById: vi.fn(),
}));
vi.mock('../../src/application/_shared/shopAccess', async (io) => ({
  ...(await io<object>()),
  authorizeShopAction: vi.fn(async () => ({ ok: true })),
}));

import { executeGetAuditEntries } from '../../src/application/audit/getAuditEntries/executeGetAuditEntries';
import { findAuditEntriesByShop, findDistinctAuditActors } from '../../src/infrastructure/cosmos/audit/CosmosAuditRepository';
import { findShopById } from '../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { findUserById } from '../../src/infrastructure/cosmos/user/CosmosUserRepository';
import { findStaffAccountById } from '../../src/infrastructure/cosmos/staff/CosmosStaffAccountRepository';
import { actionsForArea } from '../../src/domain/audit/auditAreas';

const req = {} as HttpRequest;
const entry = {
  id: 'e1', shopId: 's1', timestamp: '2026-01-01T00:00:00Z', actorType: 'owner' as const, actorId: 'u1',
  action: 'product.create', entityType: 'product', entityId: 'p1', entityName: 'Pizza',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(findShopById).mockResolvedValue({ id: 's1' } as never);
  vi.mocked(findAuditEntriesByShop).mockResolvedValue({ entries: [{ ...entry }], total: 1 });
  vi.mocked(findDistinctAuditActors).mockResolvedValue([]);
  vi.mocked(findUserById).mockResolvedValue({ name: 'Olive Owner' } as never);
  vi.mocked(findStaffAccountById).mockResolvedValue({ displayName: 'Sam', isDeleted: false } as never);
});

const call = (extra: { area?: string; actor?: string } = {}) => executeGetAuditEntries({ shopId: 's1', ...extra }, req);
const filtersArg = () => vi.mocked(findAuditEntriesByShop).mock.calls[0][3];

describe('executeGetAuditEntries filters', () => {
  it('no filters: unchanged result, no WHERE additions', async () => {
    const r = await call();
    expect(r.ok && r.data).toMatchObject({ total: 1, page: 1, pageSize: 20, actorLabels: { 'owner:u1': 'Olive Owner' } });
    expect(filtersArg()).toEqual({ actions: undefined, actorType: undefined, actorId: undefined });
  });

  it.each(['menu', 'discounts'] as const)('area %s passes its actions', async (area) => {
    await call({ area });
    expect(filtersArg()).toEqual({ actions: actionsForArea(area), actorType: undefined, actorId: undefined });
    expect(actionsForArea(area).length).toBeGreaterThan(0);
  });

  it('actor type:id and bare type', async () => {
    await call({ actor: 'staff:st1' });
    expect(filtersArg()).toMatchObject({ actorType: 'staff', actorId: 'st1' });
    vi.mocked(findAuditEntriesByShop).mockClear();
    await call({ actor: 'superadmin' });
    expect(filtersArg()).toMatchObject({ actorType: 'superadmin', actorId: undefined });
  });

  it('combines area and actor', async () => {
    await call({ area: 'staff', actor: 'owner:u1' });
    expect(filtersArg()).toEqual({ actions: actionsForArea('staff'), actorType: 'owner', actorId: 'u1' });
  });

  it.each([
    { area: 'bogus' },
    { actor: 'robot:1' },
    { actor: 'owner:' },
    { actor: ':u1' },
  ])('rejects %o with INVALID_INPUT', async (bad) => {
    const r = await call(bad);
    expect(r).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(findAuditEntriesByShop).not.toHaveBeenCalled();
  });

  it('actors come from the distinct query, not the current page', async () => {
    vi.mocked(findDistinctAuditActors).mockResolvedValue([
      { actorType: 'staff', actorId: 'st1' },
      { actorType: 'owner', actorId: 'u1' },
      { actorType: 'superadmin', actorId: 'sa' },
    ]);
    const r = await call({ actor: 'owner:u1' });
    expect(findDistinctAuditActors).toHaveBeenCalledWith('s1');
    expect(r.ok && r.data.actors).toEqual([
      { key: 'owner:u1', label: 'Olive Owner' },
      { key: 'superadmin:sa', label: 'Platform' },
      { key: 'staff:st1', label: 'Sam' },
    ]);
    // page only has the owner, yet the dropdown lists the others
    expect(r.ok && Object.keys(r.data.actorLabels)).toEqual(['owner:u1']);
  });
});
