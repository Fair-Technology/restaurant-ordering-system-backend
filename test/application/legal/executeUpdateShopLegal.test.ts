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
import { logAudit } from '../../../src/application/_shared/auditHelpers';
import { executeUpdateShopLegal } from '../../../src/application/legal/updateShopLegal/executeUpdateShopLegal';
import { COMPLETE_GMBH, COMPLETE_LEGAL, TERMS_TEXT } from '../../fixtures/legal';

const OWNER_ACCESS = {
  ok: true,
  actor: { actorType: 'owner', actorId: 'u1', role: 'owner' },
  permissions: ['manage_shop'],
};

function baseShop(extra: any = {}) {
  return { id: 'shop-1', name: 'Pizzeria', countryCode: 'DE', isDeleted: false, members: [], ...extra };
}

describe('executeUpdateShopLegal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authorizeShopAction as any).mockResolvedValue(OWNER_ACCESS);
    (findShopById as any).mockResolvedValue(baseShop());
    (updateShop as any).mockImplementation(async (s: any) => s);
  });

  it('refuses without manage_shop', async () => {
    const denied = { ok: false, code: 'FORBIDDEN', error: 'Insufficient permissions' };
    (authorizeShopAction as any).mockResolvedValue(denied);
    const r = await executeUpdateShopLegal({ shopId: 'shop-1', body: { terms: TERMS_TEXT } }, {} as any);
    expect(r).toEqual(denied);
    expect(updateShop).not.toHaveBeenCalled();
  });

  it('saves terms as revision 1', async () => {
    const r: any = await executeUpdateShopLegal({ shopId: 'shop-1', body: { terms: TERMS_TEXT } }, {} as any);
    expect(updateShop).toHaveBeenCalledWith(
      expect.objectContaining({
        legal: expect.objectContaining({
          terms: expect.objectContaining({ text: TERMS_TEXT, revision: 1, updatedBy: 'u1' }),
        }),
      }),
    );
    expect(r.data.terms.revision).toBe(1);
  });

  it('resaving identical text keeps revision 1', async () => {
    (findShopById as any).mockResolvedValue(baseShop({ legal: COMPLETE_LEGAL }));
    const r: any = await executeUpdateShopLegal({ shopId: 'shop-1', body: { terms: TERMS_TEXT } }, {} as any);
    expect(updateShop).not.toHaveBeenCalled();
    expect(r.data.terms.revision).toBe(1);
  });

  it('archives the old text when it changes', async () => {
    (findShopById as any).mockResolvedValue(baseShop({ legal: COMPLETE_LEGAL }));
    await executeUpdateShopLegal({ shopId: 'shop-1', body: { terms: 'X'.repeat(60) } }, {} as any);
    const saved = (updateShop as any).mock.calls[0][0];
    expect(saved.legal.terms.revision).toBe(2);
    expect(saved.legal.revisions).toEqual([expect.objectContaining({ kind: 'terms', revision: 1, text: TERMS_TEXT })]);
  });

  it('rejects a malformed email', async () => {
    const r = await executeUpdateShopLegal(
      { shopId: 'shop-1', body: { impressum: { ...COMPLETE_GMBH, email: 'x@y' } } },
      {} as any,
    );
    expect(r).toEqual({ ok: false, code: 'INVALID_INPUT', error: 'impressum.email is not a valid email address' });
  });

  it('rejects over-long text', async () => {
    const r = await executeUpdateShopLegal({ shopId: 'shop-1', body: { privacyAddition: 'a'.repeat(5001) } }, {} as any);
    expect(r).toEqual({
      ok: false,
      code: 'INVALID_INPUT',
      error: 'privacyAddition must be text of at most 5000 characters',
    });
  });

  it('audit entry holds field names, not content', async () => {
    await executeUpdateShopLegal({ shopId: 'shop-1', body: { impressum: COMPLETE_GMBH } }, {} as any);
    const entry = (logAudit as any).mock.calls[0][0];
    expect(entry.action).toBe('shop.legal_update');
    expect(entry.changes.length).toBeGreaterThan(0);
    expect(entry.changes.every((c: any) => c.from === null && c.to === null)).toBe(true);
    expect(JSON.stringify(entry.changes)).not.toContain('Giulia');
  });
});
