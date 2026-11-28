import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/application/_shared/shopAccess', () => ({
  authorizeShopAction: vi.fn(),
  toAuditActor: (a: { actorType: string; actorId: string }) => ({ actorType: a.actorType, actorId: a.actorId }),
}));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({ findShopById: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/promotion/CosmosPromotionRepository', () => ({
  findVouchersByShopPaginated: vi.fn(),
  countVouchersByShop: vi.fn(),
}));
vi.mock('../../../src/infrastructure/cosmos/order/CosmosOrderRepository', () => ({
  findDiscountUseRows: vi.fn(),
  findOrderById: vi.fn(),
}));

import { authorizeShopAction } from '../../../src/application/_shared/shopAccess';
import { executeGetLoyaltyVouchers } from '../../../src/application/promotion/getLoyaltyVouchers/executeGetLoyaltyVouchers';
import { findDiscountUseRows, findOrderById } from '../../../src/infrastructure/cosmos/order/CosmosOrderRepository';
import {
  countVouchersByShop,
  findVouchersByShopPaginated,
} from '../../../src/infrastructure/cosmos/promotion/CosmosPromotionRepository';
import { findShopById } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { ACCEPTED_CARD_ORDER, CARD_SHOP, VOUCHER } from '../../fixtures/orders';

const http = {} as any;
const OWNER = { ok: true, actor: { actorType: 'owner', actorId: 'u1', role: 'owner' }, permissions: ['manage_shop'] };
const NEWER = { ...VOUCHER, id: 'voucher_shop-1_L-ZZZZ9999', code: 'L-ZZZZ9999', sourceOrderId: 'o10', createdAt: '2026-10-20T10:00:00.000Z' };

describe('executeGetLoyaltyVouchers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (findShopById as any).mockResolvedValue(CARD_SHOP);
    (authorizeShopAction as any).mockResolvedValue(OWNER);
    (findVouchersByShopPaginated as any).mockResolvedValue([NEWER, VOUCHER]);
    (countVouchersByShop as any).mockResolvedValue(2);
    (findDiscountUseRows as any).mockResolvedValue([]);
    (findOrderById as any).mockResolvedValue({ ...ACCEPTED_CARD_ORDER, orderRef: 'A-1234' });
  });

  it('an owner gets the vouchers in the order the repository returns them (newest first) with paging echoed', async () => {
    const res = await executeGetLoyaltyVouchers({ shopId: 'shop-1', page: 2, pageSize: 10 }, http);
    expect(res).toEqual({
      ok: true,
      data: {
        vouchers: [
          { code: 'L-ZZZZ9999', amountCents: 500, issuedAt: '2026-10-20T10:00:00.000Z', expiresOn: '2027-01-07', used: false, orderRef: 'A-1234' },
          { code: 'L-ABCD2345', amountCents: 500, issuedAt: '2026-10-09T10:00:00.000Z', expiresOn: '2027-01-07', used: false, orderRef: 'A-1234' },
        ],
        total: 2,
        page: 2,
        pageSize: 10,
      },
    });
    expect(findVouchersByShopPaginated).toHaveBeenCalledWith('shop-1', 2, 10);
    expect(authorizeShopAction).toHaveBeenCalledWith(http, CARD_SHOP, 'manage_shop', { allowPlatformRead: true });
  });

  it('defaults to page 1 of 20', async () => {
    const res = await executeGetLoyaltyVouchers({ shopId: 'shop-1' }, http);
    expect(res.ok && [res.data.page, res.data.pageSize]).toEqual([1, 20]);
    expect(findVouchersByShopPaginated).toHaveBeenCalledWith('shop-1', 1, 20);
  });

  it('a voucher with a counted use row is used; none, or only uncounted rows, is not', async () => {
    (findDiscountUseRows as any).mockImplementation(async (_shop: string, code: string) =>
      code === 'L-ZZZZ9999'
        ? [{ state: 'REJECTED', customerEmail: 'a@b.de' }, { state: 'ACCEPTED', acceptedAt: '2026-10-21T10:00:00.000Z', customerEmail: 'a@b.de' }]
        : [{ state: 'CANCELLED', customerEmail: 'a@b.de' }],
    );
    const res = await executeGetLoyaltyVouchers({ shopId: 'shop-1' }, http);
    if (!res.ok) throw new Error('expected ok');
    expect(res.data.vouchers.map((v) => [v.code, v.used])).toEqual([['L-ZZZZ9999', true], ['L-ABCD2345', false]]);
    expect(findDiscountUseRows).toHaveBeenCalledWith('shop-1', 'L-ABCD2345');
  });

  it('never exposes the diner email or name', async () => {
    (findOrderById as any).mockResolvedValue({ ...ACCEPTED_CARD_ORDER, orderRef: 'A-1234', customerEmail: 'diner@example.com', customerName: 'Dina Diner' });
    (findDiscountUseRows as any).mockResolvedValue([{ state: 'ACCEPTED', customerEmail: 'diner@example.com' }]);
    const res = await executeGetLoyaltyVouchers({ shopId: 'shop-1' }, http);
    if (!res.ok) throw new Error('expected ok');
    for (const v of res.data.vouchers) {
      expect(Object.keys(v).sort()).toEqual(['amountCents', 'code', 'expiresOn', 'issuedAt', 'orderRef', 'used']);
      expect(v).not.toHaveProperty('customerEmail');
      expect(v).not.toHaveProperty('customerName');
    }
    const json = JSON.stringify(res.data);
    expect(json).not.toContain('diner@example.com');
    expect(json).not.toContain('Dina Diner');
  });

  it('orderRef comes from the source order, and is null when that order is missing', async () => {
    (findOrderById as any).mockImplementation(async (id: string) => (id === 'o10' ? { ...ACCEPTED_CARD_ORDER, orderRef: 'B-9' } : null));
    const res = await executeGetLoyaltyVouchers({ shopId: 'shop-1' }, http);
    if (!res.ok) throw new Error('expected ok');
    expect(res.data.vouchers.map((v) => v.orderRef)).toEqual(['B-9', null]);
    expect(findOrderById).toHaveBeenCalledWith('o10');
    expect(findOrderById).toHaveBeenCalledWith('o9');
  });

  it.each([0, -1, 1.5, NaN])('rejects page %s', async (page) => {
    const res = await executeGetLoyaltyVouchers({ shopId: 'shop-1', page }, http);
    expect(res).toMatchObject({ ok: false, code: 'INVALID_INPUT', errorCode: 'PAGE_INVALID', field: 'page' });
    expect(findVouchersByShopPaginated).not.toHaveBeenCalled();
  });

  it.each([0, -5, 2.5, 101, NaN])('rejects pageSize %s', async (pageSize) => {
    const res = await executeGetLoyaltyVouchers({ shopId: 'shop-1', pageSize }, http);
    expect(res).toMatchObject({ ok: false, code: 'INVALID_INPUT', errorCode: 'PAGE_SIZE_INVALID', field: 'pageSize' });
    expect(findVouchersByShopPaginated).not.toHaveBeenCalled();
  });

  it('accepts the largest page size', async () => {
    const res = await executeGetLoyaltyVouchers({ shopId: 'shop-1', pageSize: 100 }, http);
    expect(res.ok).toBe(true);
  });

  it('only people who manage the shop', async () => {
    const refusal = { ok: false, code: 'FORBIDDEN', error: 'Forbidden' };
    (authorizeShopAction as any).mockResolvedValue(refusal);
    const res = await executeGetLoyaltyVouchers({ shopId: 'shop-1' }, http);
    expect(res).toEqual(refusal);
    expect(findVouchersByShopPaginated).not.toHaveBeenCalled();
  });

  it('an unexpected failure is an internal error', async () => {
    (countVouchersByShop as any).mockRejectedValue(new Error('boom'));
    const res = await executeGetLoyaltyVouchers({ shopId: 'shop-1' }, http);
    expect(res).toEqual({ ok: false, code: 'INTERNAL_ERROR', error: 'Failed to load loyalty vouchers' });
  });
});
