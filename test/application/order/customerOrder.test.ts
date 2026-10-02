import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({ findShopById: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/order/CosmosOrderRepository', () => ({
  findOrderById: vi.fn(),
  findOrderWithEtag: vi.fn(),
  replaceOrderIfMatch: vi.fn(),
}));
vi.mock('../../../src/infrastructure/email/emailSender', () => ({
  sendEmail: vi.fn(async () => undefined),
  emailTransportName: () => 'log',
}));

import { executeCancelCustomerOrder } from '../../../src/application/order/customer/executeCancelCustomerOrder';
import { executeGetCustomerOrder } from '../../../src/application/order/customer/executeGetCustomerOrder';
import {
  findOrderById,
  findOrderWithEtag,
  replaceOrderIfMatch,
} from '../../../src/infrastructure/cosmos/order/CosmosOrderRepository';
import { findShopById } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { sendEmail } from '../../../src/infrastructure/email/emailSender';
import { CANNOT_CANCEL_ERROR } from '../../../src/domain/order/orderErrors';
import { CASH_SHOP, PLACED_CASH_ORDER } from '../../fixtures/orders';

const TOKEN = 'T'.repeat(32);
const now = new Date('2026-10-05T10:05:00Z');

function stored(order = PLACED_CASH_ORDER): void {
  (findOrderById as any).mockResolvedValue(order);
  (findOrderWithEtag as any).mockResolvedValue({ order, etag: 'etag-1' });
}

describe('customer order page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (findShopById as any).mockResolvedValue(CASH_SHOP);
    (replaceOrderIfMatch as any).mockResolvedValue('ok');
    stored();
  });

  it('shows the order with the right token', async () => {
    const res = await executeGetCustomerOrder({ orderId: 'o1', token: TOKEN }, { now });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toMatchObject({
      orderRef: 'AB3-K7P',
      shopName: 'Ma Pasta',
      shopSlug: 'mapasta',
      sellerPhone: '069 1234567',
      canCancel: true,
      rejectionReason: null,
      paymentMethod: 'cash',
    });
  });

  it('a wrong token looks like a missing order', async () => {
    const res = await executeGetCustomerOrder({ orderId: 'o1', token: 'X'.repeat(32) }, { now });
    expect(res).toEqual({ ok: false, code: 'NOT_FOUND', error: 'Order not found' });
  });

  it('an order without a token is never shown', async () => {
    stored({ ...PLACED_CASH_ORDER, customerAccessToken: undefined });
    const res = await executeGetCustomerOrder({ orderId: 'o1', token: '' }, { now });
    expect(res).toEqual({ ok: false, code: 'NOT_FOUND', error: 'Order not found' });
  });

  it('customer cancels before acceptance', async () => {
    const res = await executeCancelCustomerOrder({ orderId: 'o1', token: TOKEN }, { now });
    const written = (replaceOrderIfMatch as any).mock.calls[0][0];
    expect(written.state).toBe('CANCELLED');
    expect(written.history.at(-1)).toMatchObject({ actor: { type: 'customer' }, reason: 'customer_cancelled' });
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Ma Pasta: Bestellung AB3-K7P storniert' }),
    );
    expect(res.ok && res.data.canCancel).toBe(false);
  });

  it('cannot cancel once accepted', async () => {
    stored({ ...PLACED_CASH_ORDER, state: 'ACCEPTED', readyAt: '2026-10-05T10:25:00.000Z', prepMinutes: 20 });
    const res = await executeCancelCustomerOrder({ orderId: 'o1', token: TOKEN }, { now });
    expect(res).toEqual({ ok: false, code: 'CONFLICT', error: CANNOT_CANCEL_ERROR });
    expect(replaceOrderIfMatch).not.toHaveBeenCalled();
  });
});
