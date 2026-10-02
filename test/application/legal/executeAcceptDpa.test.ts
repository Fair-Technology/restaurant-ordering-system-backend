import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/application/_shared/shopAccess', () => ({
  authorizeShopAction: vi.fn(),
  toAuditActor: (a: any) => ({ actorType: a.actorType, actorId: a.actorId }),
}));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({
  findShopById: vi.fn(),
  updateShop: vi.fn(async (s: any) => s),
}));
vi.mock('../../../src/infrastructure/cosmos/system/CosmosPlatformLegalIdentityRepository', async () => {
  const { COMPLETE_IDENTITY } = await import('../../fixtures/legal');
  return { getPlatformLegalIdentity: vi.fn(async () => COMPLETE_IDENTITY) };
});
vi.mock('../../../src/application/_shared/auditHelpers', () => ({
  logAudit: vi.fn(),
  diffFields: vi.fn(() => []),
}));

import { authorizeShopAction } from '../../../src/application/_shared/shopAccess';
import { findShopById, updateShop } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { CURRENT_DPA } from '../../../src/domain/legal/platformDocuments';
import { executeAcceptDpa } from '../../../src/application/legal/acceptDpa/executeAcceptDpa';
import { ACCEPTED_DPA } from '../../fixtures/legal';

const OLD = { ...ACCEPTED_DPA, version: 'old' };
const OUTDATED_ERROR = 'The data processing agreement has changed — reload and accept the current version';

describe('executeAcceptDpa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authorizeShopAction as any).mockResolvedValue({
      ok: true,
      actor: { actorType: 'owner', actorId: 'u1', role: 'owner' },
      permissions: [],
    });
    (findShopById as any).mockResolvedValue({
      id: 'shop-1',
      name: 'Pizzeria',
      isDeleted: false,
      members: [],
      dpaAcceptance: OLD,
      dpaAcceptanceHistory: [OLD],
    });
    (updateShop as any).mockImplementation(async (s: any) => s);
  });

  it('refuses a non-owner', async () => {
    (authorizeShopAction as any).mockResolvedValue({
      ok: true,
      actor: { actorType: 'staff', actorId: 's1', role: 'manager' },
      permissions: ['manage_shop'],
    });
    const r = await executeAcceptDpa({ shopId: 'shop-1', version: CURRENT_DPA.version }, {} as any);
    expect(r).toEqual({ ok: false, code: 'FORBIDDEN', error: 'Only the restaurant owner can do this' });
    expect(updateShop).not.toHaveBeenCalled();
  });

  it('refuses an outdated version', async () => {
    const r = await executeAcceptDpa({ shopId: 'shop-1', version: '2025-01-01' }, {} as any);
    expect(r).toEqual({ ok: false, code: 'INVALID_INPUT', error: OUTDATED_ERROR });
    expect(updateShop).not.toHaveBeenCalled();
  });

  it('records acceptance and keeps history', async () => {
    const r: any = await executeAcceptDpa(
      { shopId: 'shop-1', version: CURRENT_DPA.version, now: new Date('2026-10-02T09:00:00Z') },
      {} as any,
    );
    const saved = (updateShop as any).mock.calls[0][0];
    expect(saved.dpaAcceptance).toEqual({
      version: CURRENT_DPA.version,
      acceptedAt: '2026-10-02T09:00:00.000Z',
      acceptedByUserId: 'u1',
      shopNameAtAcceptance: 'Pizzeria',
    });
    expect(saved.dpaAcceptanceHistory).toHaveLength(2);
    expect(r.data.dpa.accepted.version).toBe(CURRENT_DPA.version);
  });
});
