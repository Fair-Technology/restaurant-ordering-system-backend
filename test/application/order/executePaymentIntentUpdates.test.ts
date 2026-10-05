import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/infrastructure/cosmos/order/CosmosCheckoutSessionRepository', () => ({
  deleteCheckoutSession: vi.fn(),
}));
vi.mock('../../../src/infrastructure/cosmos/order/CosmosOrderRepository', () => ({
  findOrderByStripePaymentIntentId: vi.fn(),
  findOrderWithEtag: vi.fn(),
  replaceOrderIfMatch: vi.fn(),
}));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({ findShopById: vi.fn() }));
vi.mock('../../../src/infrastructure/stripe/stripeClient', () => ({
  releaseAuthorization: vi.fn(async () => 'canceled'),
  createRefund: vi.fn(async () => ({ id: 're_1' })),
  findLiveRefund: vi.fn(async () => null),
}));
vi.mock('../../../src/infrastructure/email/emailSender', () => ({
  sendEmail: vi.fn(async () => undefined),
  emailTransportName: () => 'log',
}));

import { executePaymentIntentUpdates } from '../../../src/application/order/paymentIntentUpdates/executePaymentIntentUpdates';
import { deleteCheckoutSession } from '../../../src/infrastructure/cosmos/order/CosmosCheckoutSessionRepository';
import {
  findOrderByStripePaymentIntentId,
  findOrderWithEtag,
  replaceOrderIfMatch,
} from '../../../src/infrastructure/cosmos/order/CosmosOrderRepository';
import { findShopById } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { sendEmail } from '../../../src/infrastructure/email/emailSender';
import { CARD_SHOP, orderStore, PLACED_CARD_ORDER } from '../../fixtures/orders';

const now = new Date('2026-10-05T10:05:00Z');

function stored(order = PLACED_CARD_ORDER) {
  const store = orderStore(order);
  (findOrderByStripePaymentIntentId as any).mockResolvedValue(order);
  (findOrderWithEtag as any).mockImplementation(store.findOrderWithEtag);
  (replaceOrderIfMatch as any).mockImplementation(store.replaceOrderIfMatch);
  return store;
}

describe('executePaymentIntentUpdates (payment cancelled)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (findShopById as any).mockResolvedValue(CARD_SHOP);
  });

  it('drops the checkout of a payment nobody ordered with', async () => {
    (findOrderByStripePaymentIntentId as any).mockResolvedValue(null);
    expect(await executePaymentIntentUpdates({ sessionId: 'sess-1', paymentIntentId: 'pi_1', now })).toBe('session_removed');
    expect(deleteCheckoutSession).toHaveBeenCalledWith('sess-1');
  });

  it('declines a waiting order whose reservation is gone, and tells the diner', async () => {
    const store = stored();
    expect(await executePaymentIntentUpdates({ paymentIntentId: 'pi_1', now })).toBe('declined');
    expect(store.current.state).toBe('REJECTED');
    expect(store.current.payment.status).toBe('canceled');
    expect(store.current.history.at(-1)).toMatchObject({ actor: { type: 'system' }, reason: 'payment_failed' });
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ subject: 'Ma Pasta: Bestellung AB3-K7P abgelehnt' }));
  });

  it('records the release of an order we already closed', async () => {
    const store = stored({ ...PLACED_CARD_ORDER, state: 'REJECTED' });
    expect(await executePaymentIntentUpdates({ paymentIntentId: 'pi_1', now })).toBe('release_recorded');
    expect(store.current.payment.status).toBe('canceled');
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('ignores a paid order', async () => {
    stored({ ...PLACED_CARD_ORDER, state: 'ACCEPTED', payment: { ...PLACED_CARD_ORDER.payment, status: 'paid' } });
    expect(await executePaymentIntentUpdates({ paymentIntentId: 'pi_1', now })).toBe('ignored');
    expect(replaceOrderIfMatch).not.toHaveBeenCalled();
  });
});
