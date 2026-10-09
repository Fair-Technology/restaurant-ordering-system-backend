import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/application/_shared/shopAccess', () => ({
  authorizeShopAction: vi.fn(),
  toAuditActor: (a: { actorType: string; actorId: string }) => ({ actorType: a.actorType, actorId: a.actorId }),
}));
vi.mock('../../../src/application/_shared/auditHelpers', () => ({ logAudit: vi.fn(async () => undefined) }));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({ findShopById: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/promotion/CosmosPromotionRepository', () => ({
  findPromotions: vi.fn(),
  findPromotionsWithEtag: vi.fn(),
  createPromotions: vi.fn(),
  replacePromotionsIfMatch: vi.fn(),
}));
vi.mock('../../../src/infrastructure/cosmos/order/CosmosOrderRepository', () => ({ listDiscountUseRows: vi.fn() }));

import { logAudit } from '../../../src/application/_shared/auditHelpers';
import { authorizeShopAction } from '../../../src/application/_shared/shopAccess';
import { executeCreateDiscountCode } from '../../../src/application/promotion/createDiscountCode/executeCreateDiscountCode';
import { executeGetPromotions } from '../../../src/application/promotion/getPromotions/executeGetPromotions';
import { executeSetDiscountCodeActive } from '../../../src/application/promotion/setDiscountCodeActive/executeSetDiscountCodeActive';
import { executeUpdateLoyalty } from '../../../src/application/promotion/updateLoyalty/executeUpdateLoyalty';
import {
  DISCOUNT_CODE_EXISTS_ERROR,
  DISCOUNT_CODE_LIMIT_ERROR,
  DISCOUNT_CODE_NOT_FOUND_ERROR,
} from '../../../src/domain/promotion/promotions';
import { listDiscountUseRows } from '../../../src/infrastructure/cosmos/order/CosmosOrderRepository';
import {
  createPromotions,
  findPromotions,
  findPromotionsWithEtag,
  replacePromotionsIfMatch,
} from '../../../src/infrastructure/cosmos/promotion/CosmosPromotionRepository';
import { findShopById } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { CARD_SHOP, PROMOTIONS, PROMO_CODE } from '../../fixtures/orders';

const http = {} as any;
const now = new Date('2026-10-09T10:00:00Z');
const OWNER = { ok: true, actor: { actorType: 'owner', actorId: 'u1', role: 'owner' }, permissions: ['manage_shop'] };
const withDoc = (doc: unknown) => (findPromotionsWithEtag as any).mockResolvedValue({ doc, etag: 'e1' });

describe('promotion endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (findShopById as any).mockResolvedValue(CARD_SHOP);
    (authorizeShopAction as any).mockResolvedValue(OWNER);
    (findPromotionsWithEtag as any).mockResolvedValue(null);
    (findPromotions as any).mockResolvedValue(null);
    (createPromotions as any).mockResolvedValue('ok');
    (replacePromotionsIfMatch as any).mockResolvedValue('ok');
    (listDiscountUseRows as any).mockResolvedValue([]);
  });

  it('an owner creates a code', async () => {
    const res = await executeCreateDiscountCode(
      { shopId: 'shop-1', body: { code: 'welcome10', kind: 'percent', percent: 10 }, now },
      http,
    );
    expect(res.ok).toBe(true);
    expect(authorizeShopAction).toHaveBeenCalledWith(http, CARD_SHOP, 'manage_shop');
    expect(createPromotions).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'promotions_shop-1',
        kind: 'shop_promotions',
        shopId: 'shop-1',
        loyalty: null,
        codes: [expect.objectContaining({ code: 'WELCOME10', percent: 10, perEmailLimit: 1, active: true })],
      }),
    );
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'promotion.code_create', changes: [{ field: 'code', from: null, to: 'WELCOME10' }] }),
    );
  });

  it('a code name is used only once per restaurant', async () => {
    withDoc({ ...PROMOTIONS, codes: [{ ...PROMO_CODE, active: false }] });
    const res = await executeCreateDiscountCode(
      { shopId: 'shop-1', body: { code: 'WELCOME10', kind: 'percent', percent: 5 }, now },
      http,
    );
    expect(res).toEqual({ ok: false, code: 'CONFLICT', error: DISCOUNT_CODE_EXISTS_ERROR });
  });

  it('at most 50 codes', async () => {
    withDoc({
      ...PROMOTIONS,
      codes: Array.from({ length: 50 }, (_, i) => ({ ...PROMO_CODE, id: `c${i}`, code: `CODE${i}` })),
    });
    const res = await executeCreateDiscountCode(
      { shopId: 'shop-1', body: { code: 'EXTRA', kind: 'percent', percent: 5 }, now },
      http,
    );
    expect(res).toEqual({ ok: false, code: 'INVALID_INPUT', error: DISCOUNT_CODE_LIMIT_ERROR });
  });

  it('a code is switched off and nothing else changes', async () => {
    withDoc(PROMOTIONS);
    const res = await executeSetDiscountCodeActive({ shopId: 'shop-1', codeId: 'code-1', body: { active: false }, now }, http);
    expect(res.ok).toBe(true);
    expect(replacePromotionsIfMatch).toHaveBeenCalledWith(
      { ...PROMOTIONS, codes: [{ ...PROMO_CODE, active: false }], updatedAt: '2026-10-09T10:00:00.000Z' },
      'e1',
    );
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'promotion.code_update',
        changes: [{ field: 'WELCOME10 active', from: true, to: false }],
      }),
    );
  });

  it('an unknown code id is not found', async () => {
    withDoc(PROMOTIONS);
    const res = await executeSetDiscountCodeActive({ shopId: 'shop-1', codeId: 'nope', body: { active: false }, now }, http);
    expect(res).toEqual({ ok: false, code: 'NOT_FOUND', error: DISCOUNT_CODE_NOT_FOUND_ERROR });
  });

  it('a clash with another save is retried', async () => {
    withDoc(PROMOTIONS);
    (replacePromotionsIfMatch as any).mockResolvedValueOnce('conflict').mockResolvedValueOnce('ok');
    const res = await executeSetDiscountCodeActive({ shopId: 'shop-1', codeId: 'code-1', body: { active: false }, now }, http);
    expect(res.ok).toBe(true);
    expect(findPromotionsWithEtag).toHaveBeenCalledTimes(2);
  });

  it('loyalty is saved and restarts its count when switched on', async () => {
    withDoc({ ...PROMOTIONS, loyalty: null });
    const res = await executeUpdateLoyalty(
      { shopId: 'shop-1', body: { enabled: true, everyOrders: 5, rewardCents: 500 }, now },
      http,
    );
    expect(res.ok).toBe(true);
    expect((replacePromotionsIfMatch as any).mock.calls[0][0].loyalty).toEqual({
      enabled: true,
      everyOrders: 5,
      rewardCents: 500,
      validDays: 90,
      since: '2026-10-09T10:00:00.000Z',
    });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'promotion.loyalty_update' }));
  });

  it('only people who manage the shop', async () => {
    const refusal = { ok: false, code: 'FORBIDDEN', error: 'Forbidden' };
    (authorizeShopAction as any).mockResolvedValue(refusal);
    const res = await executeCreateDiscountCode(
      { shopId: 'shop-1', body: { code: 'WELCOME10', kind: 'percent', percent: 10 }, now },
      http,
    );
    expect(res).toEqual(refusal);
    expect(createPromotions).not.toHaveBeenCalled();
  });

  it('lists codes with how often they were used', async () => {
    (findPromotions as any).mockResolvedValue(PROMOTIONS);
    (listDiscountUseRows as any).mockResolvedValue([
      { code: 'WELCOME10', state: 'COMPLETED', acceptedAt: 'x' },
      { code: 'WELCOME10', state: 'REJECTED' },
      { code: 'L-ABCD2345', state: 'PLACED' },
    ]);
    const res = await executeGetPromotions({ shopId: 'shop-1' }, http);
    expect(res.ok && res.data.codes[0].uses).toBe(1);
    expect(res.ok && res.data.loyalty.since).toBe('2026-10-01T00:00:00.000Z');
  });

  it('a restaurant without discounts gets empty defaults', async () => {
    const res = await executeGetPromotions({ shopId: 'shop-1' }, http);
    expect(res.ok && res.data).toEqual({
      codes: [],
      loyalty: { enabled: false, everyOrders: 5, rewardCents: 500, validDays: 90, since: null },
    });
  });
});
