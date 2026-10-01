import { describe, it, expect } from 'vitest';
import { buildAutoAcceptedOrder } from '../../../src/application/order/handlePaymentSucceeded/buildAutoAcceptedOrder';
import { CheckoutSession } from '../../../src/domain/order/CheckoutSession';

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

describe('buildAutoAcceptedOrder', () => {
  it('builds an accepted collection order', () => {
    const order = buildAutoAcceptedOrder({
      session,
      paymentIntentId: 'pi_1',
      orderRef: 'AB3-K7P',
      now: new Date('2026-09-30T22:30:00Z'),
      timeZone: 'Europe/Berlin',
    });
    expect(order.id).toBe('sess-1');
    expect(order.state).toBe('ACCEPTED');
    expect(order.payment).toEqual({ method: 'card', status: 'paid', stripePaymentIntentId: 'pi_1' });
    expect(order.acceptedAt).toBe('2026-09-30T22:30:00.000Z');
    expect(order.readyAt).toBe('2026-09-30T22:50:00.000Z');
    expect(order.prepMinutes).toBe(20);
    expect(order.usagePeriodKey).toBe('2026-10');
    expect(order.history.map((h) => h.to)).toEqual(['PLACED', 'ACCEPTED']);
  });

  it('does not copy the session ttl', () => {
    const order = buildAutoAcceptedOrder({
      session,
      paymentIntentId: 'pi_1',
      orderRef: 'AB3-K7P',
      now: new Date('2026-09-30T22:30:00Z'),
      timeZone: 'Europe/Berlin',
    });
    expect(order).not.toHaveProperty('ttl');
  });
});
