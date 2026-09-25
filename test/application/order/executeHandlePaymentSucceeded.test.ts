import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CheckoutSession } from '../../../src/domain/order/CheckoutSession';

vi.mock('../../../src/infrastructure/cosmos/order/CosmosCheckoutSessionRepository', () => ({
  findCheckoutSessionById: vi.fn(),
  deleteCheckoutSession: vi.fn(),
}));
vi.mock('../../../src/infrastructure/cosmos/order/CosmosOrderRepository', () => ({
  createOrder: vi.fn(),
}));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({
  findShopById: vi.fn(),
}));
vi.mock('../../../src/domain/order/orderRef', () => ({
  generateOrderRef: () => 'AB3-K7P',
}));

import { findCheckoutSessionById, deleteCheckoutSession } from '../../../src/infrastructure/cosmos/order/CosmosCheckoutSessionRepository';
import { createOrder } from '../../../src/infrastructure/cosmos/order/CosmosOrderRepository';
import { findShopById } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { executeHandlePaymentSucceeded } from '../../../src/application/order/handlePaymentSucceeded/executeHandlePaymentSucceeded';

const session: CheckoutSession = {
  id: 'sess-1',
  shopId: 'shop-1',
  stripePaymentIntentId: 'pi_1',
  items: [{ productId: 'p1', productName: 'Margherita', quantity: 2, unitPriceCents: 900, lineTotalCents: 1800 }],
  subtotalCents: 1800,
  currency: 'EUR',
  customerName: 'Anna',
  customerEmail: 'a@example.com',
  customerPhone: '+49 30 1234',
  fulfilmentMode: 'collection',
  createdAt: '2026-09-30T22:00:00.000Z',
  ttl: 3600,
};

const now = new Date('2026-09-30T22:30:00Z');

beforeEach(() => {
  vi.clearAllMocks();
  (findShopById as any).mockResolvedValue({ id: 'shop-1', timezone: 'Europe/Berlin' });
});

describe('executeHandlePaymentSucceeded', () => {
  it('creates an accepted order and deletes the session', async () => {
    (findCheckoutSessionById as any).mockResolvedValue(session);
    (createOrder as any).mockResolvedValue(undefined);

    const outcome = await executeHandlePaymentSucceeded({ sessionId: 'sess-1', paymentIntentId: 'pi_1', now });

    expect(outcome).toBe('created');
    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(createOrder).toHaveBeenCalledWith(expect.objectContaining({ id: 'sess-1', state: 'ACCEPTED' }));
    expect(deleteCheckoutSession).toHaveBeenCalledWith('sess-1');
  });

  it('no session', async () => {
    (findCheckoutSessionById as any).mockResolvedValue(null);

    const outcome = await executeHandlePaymentSucceeded({ sessionId: 'sess-1', paymentIntentId: 'pi_1', now });

    expect(outcome).toBe('no_session');
    expect(createOrder).not.toHaveBeenCalled();
  });

  it('duplicate delivery', async () => {
    (findCheckoutSessionById as any).mockResolvedValue(session);
    (createOrder as any).mockRejectedValue({ code: 409 });

    const outcome = await executeHandlePaymentSucceeded({ sessionId: 'sess-1', paymentIntentId: 'pi_1', now });

    expect(outcome).toBe('duplicate');
    expect(deleteCheckoutSession).toHaveBeenCalledWith('sess-1');
  });

  it('other Cosmos error bubbles', async () => {
    (findCheckoutSessionById as any).mockResolvedValue(session);
    (createOrder as any).mockRejectedValue({ code: 500 });

    await expect(executeHandlePaymentSucceeded({ sessionId: 'sess-1', paymentIntentId: 'pi_1', now })).rejects.toEqual({ code: 500 });
  });
});
