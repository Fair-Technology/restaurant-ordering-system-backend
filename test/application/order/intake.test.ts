import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/application/_shared/shopAccess', () => ({ authorizeShopAction: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({ findShopById: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/order/CosmosOrderRepository', () => ({
  findOrderWithEtag: vi.fn(),
  replaceOrderIfMatch: vi.fn(),
  findOrdersByShopIdAndStates: vi.fn(),
}));
vi.mock('../../../src/infrastructure/cosmos/usage/CosmosUsageRepository', () => ({ incrementAcceptedOrders: vi.fn() }));
vi.mock('../../../src/infrastructure/email/emailSender', () => ({
  sendEmail: vi.fn(async () => undefined),
  emailTransportName: () => 'log',
}));

import { authorizeShopAction } from '../../../src/application/_shared/shopAccess';
import { executeAcceptOrder } from '../../../src/application/order/intake/executeAcceptOrder';
import { executeCompleteOrder } from '../../../src/application/order/intake/executeCompleteOrder';
import { executeGetOrderQueue } from '../../../src/application/order/intake/executeGetOrderQueue';
import { executeMarkOrderReady } from '../../../src/application/order/intake/executeMarkOrderReady';
import { executeRejectOrder } from '../../../src/application/order/intake/executeRejectOrder';
import {
  findOrderWithEtag,
  findOrdersByShopIdAndStates,
  replaceOrderIfMatch,
} from '../../../src/infrastructure/cosmos/order/CosmosOrderRepository';
import { findShopById } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { incrementAcceptedOrders } from '../../../src/infrastructure/cosmos/usage/CosmosUsageRepository';
import { sendEmail } from '../../../src/infrastructure/email/emailSender';
import { ORDER_CHANGED_ERROR, ORDER_NOT_FOUND_ERROR, PREP_MINUTES_ERROR, REJECT_REASON_ERROR } from '../../../src/domain/order/orderErrors';
import { CARD_SHOP, PLACED_CARD_ORDER } from '../../fixtures/orders';

const http = {} as any;
const now = new Date('2026-10-05T10:05:00Z');
const ids = { shopId: 'shop-1', orderId: 'o1' };
const STAFF_ACCESS = {
  ok: true,
  actor: { actorType: 'staff', actorId: 's1', role: 'staff' },
  permissions: ['view_orders'],
};
const ACCEPTED_ORDER = {
  ...PLACED_CARD_ORDER,
  state: 'ACCEPTED' as const,
  readyAt: '2026-10-05T10:25:00.000Z',
  prepMinutes: 20,
};

function storedOrder(order = PLACED_CARD_ORDER): void {
  (findOrderWithEtag as any).mockResolvedValue({ order, etag: 'etag-1' });
}

describe('kitchen intake', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authorizeShopAction as any).mockResolvedValue(STAFF_ACCESS);
    (findShopById as any).mockResolvedValue(CARD_SHOP);
    (replaceOrderIfMatch as any).mockResolvedValue('ok');
    storedOrder();
  });

  it('staff accepts with the default prep time', async () => {
    const res = await executeAcceptOrder(ids, http, { now });
    expect(replaceOrderIfMatch).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'ACCEPTED',
        readyAt: '2026-10-05T10:25:00.000Z',
        prepMinutes: 20,
        usagePeriodKey: '2026-10',
      }),
      'etag-1',
    );
    const written = (replaceOrderIfMatch as any).mock.calls[0][0];
    expect(written.history.at(-1)).toEqual({
      from: 'PLACED',
      to: 'ACCEPTED',
      at: '2026-10-05T10:05:00.000Z',
      actor: { type: 'staff', id: 's1' },
    });
    expect(incrementAcceptedOrders).toHaveBeenCalledWith('shop-1', '2026-10');
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Ma Pasta: Bestellung AB3-K7P angenommen – abholbereit um 12:25' }),
    );
    expect(res.ok && res.data.state).toBe('ACCEPTED');
  });

  it('accepts with an adjusted prep time', async () => {
    await executeAcceptOrder({ ...ids, prepMinutes: 35 }, http, { now });
    expect((replaceOrderIfMatch as any).mock.calls[0][0].readyAt).toBe('2026-10-05T10:40:00.000Z');
  });

  it('refuses a prep time out of range', async () => {
    const res = await executeAcceptOrder({ ...ids, prepMinutes: 3 }, http, { now });
    expect(res).toEqual({ ok: false, code: 'INVALID_INPUT', error: PREP_MINUTES_ERROR });
  });

  it('a second accept on an accepted order conflicts', async () => {
    storedOrder(ACCEPTED_ORDER);
    const res = await executeAcceptOrder(ids, http, { now });
    expect(res).toEqual({ ok: false, code: 'CONFLICT', error: 'Cannot move from ACCEPTED to ACCEPTED' });
    expect(incrementAcceptedOrders).not.toHaveBeenCalled();
  });

  it('a concurrent update conflicts', async () => {
    (replaceOrderIfMatch as any).mockResolvedValue('conflict');
    const res = await executeAcceptOrder(ids, http, { now });
    expect(res).toEqual({ ok: false, code: 'CONFLICT', error: ORDER_CHANGED_ERROR });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(incrementAcceptedOrders).not.toHaveBeenCalled();
  });

  it('an order from another restaurant is not found', async () => {
    storedOrder({ ...PLACED_CARD_ORDER, shopId: 'shop-2' });
    const res = await executeAcceptOrder(ids, http, { now });
    expect(res).toEqual({ ok: false, code: 'NOT_FOUND', error: ORDER_NOT_FOUND_ERROR });
  });

  it('rejects with a reason and tells the customer', async () => {
    await executeRejectOrder({ ...ids, reason: 'too_busy', note: 'Ofen kaputt' }, http, { now });
    const written = (replaceOrderIfMatch as any).mock.calls[0][0];
    expect(written.state).toBe('REJECTED');
    expect(written.history.at(-1).reason).toBe('too_busy');
    expect(written.rejectionNote).toBe('Ofen kaputt');
    expect(written.payment).toEqual(PLACED_CARD_ORDER.payment);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Ma Pasta: Bestellung AB3-K7P abgelehnt' }),
    );
  });

  it('refuses an unknown reason', async () => {
    const res = await executeRejectOrder({ ...ids, reason: 'meh' as any }, http, { now });
    expect(res).toEqual({ ok: false, code: 'INVALID_INPUT', error: REJECT_REASON_ERROR });
  });

  it('marks ready', async () => {
    storedOrder(ACCEPTED_ORDER);
    const res = await executeMarkOrderReady(ids, http, { now });
    expect(res.ok && res.data.state).toBe('READY');
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Ma Pasta: Bestellung AB3-K7P ist abholbereit' }),
    );
  });

  it('handing over a cash order marks the cash collected', async () => {
    storedOrder({ ...ACCEPTED_ORDER, state: 'READY' });
    const res = await executeCompleteOrder(ids, http, { now });
    expect(res.ok && res.data.state).toBe('COMPLETED');
    expect(res.ok && res.data.paymentStatus).toBe('cash_collected');
  });

  it('without permission is refused', async () => {
    const refusal = { ok: false, code: 'FORBIDDEN', error: 'Insufficient permissions' };
    (authorizeShopAction as any).mockResolvedValue(refusal);
    expect(await executeAcceptOrder(ids, http, { now })).toEqual(refusal);
    expect(findOrderWithEtag).not.toHaveBeenCalled();
  });

  it('queue lists active orders', async () => {
    (findOrdersByShopIdAndStates as any).mockResolvedValue([PLACED_CARD_ORDER]);
    const res = await executeGetOrderQueue({ shopId: 'shop-1' }, http, { now });
    expect(findOrdersByShopIdAndStates).toHaveBeenCalledWith('shop-1', ['PLACED', 'ACCEPTED', 'READY']);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.orders[0].autoRejectAt).toBe('2026-10-05T10:10:00.000Z');
    expect(res.data.defaultPrepMinutes.collection).toBe(20);
    expect('customerAccessToken' in res.data.orders[0]).toBe(false);
  });
});
