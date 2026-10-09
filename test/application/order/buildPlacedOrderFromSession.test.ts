import { describe, it, expect } from 'vitest';
import { buildPlacedOrderFromSession } from '../../../src/application/order/handlePaymentAuthorized/buildPlacedOrderFromSession';
import { CheckoutSession } from '../../../src/domain/order/CheckoutSession';
import { ADDRESS, DELIVERY_ADDRESS, FEE_CHARGE } from '../../fixtures/orders';

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
  customerAddress: ADDRESS,
  fulfilmentMode: 'collection',
  customerAccessToken: 'T'.repeat(32),
  idempotencyKey: 'key-12345678',
  createdAt: '2026-10-05T09:59:00.000Z',
  ttl: 3600,
};
const now = new Date('2026-10-05T10:00:00Z');

describe('buildPlacedOrderFromSession', () => {
  it('builds a placed order with the money reserved', () => {
    const order = buildPlacedOrderFromSession({
      session,
      paymentIntentId: 'pi_1',
      orderRef: 'AB3-K7P',
      autoRejectMinutes: 10,
      now,
    });
    expect(order).toMatchObject({
      id: 'sess-1',
      state: 'PLACED',
      orderRef: 'AB3-K7P',
      payment: { method: 'card', status: 'authorized', stripePaymentIntentId: 'pi_1' },
      customerAddress: ADDRESS,
      customerAccessToken: 'T'.repeat(32),
      idempotencyKey: 'key-12345678',
      autoRejectAt: '2026-10-05T10:10:00.000Z',
      history: [{ from: null, to: 'PLACED', at: '2026-10-05T10:00:00.000Z', actor: { type: 'customer' } }],
    });
  });

  it('carries the session fulfilment mode as it is', () => {
    const order = buildPlacedOrderFromSession({
      session: { ...session, fulfilmentMode: 'dine_in' },
      paymentIntentId: 'pi_1',
      orderRef: 'AB3-K7P',
      autoRejectMinutes: 10,
      now,
    });
    expect(order.fulfilmentMode).toBe('dine_in');
  });

  it('copies only the fields the session has', () => {
    const { customerAddress: _a, customerAccessToken: _t, ...bare } = session;
    const order = buildPlacedOrderFromSession({
      session: bare,
      paymentIntentId: 'pi_1',
      orderRef: 'AB3-K7P',
      autoRejectMinutes: 10,
      now,
    });
    expect(order).not.toHaveProperty('customerAddress');
    expect(order).not.toHaveProperty('customerAccessToken');
    expect(order).not.toHaveProperty('taxBreakdown');
  });

  it('copies the table from the session', () => {
    const args = { paymentIntentId: 'pi_1', orderRef: 'AB3-K7P', autoRejectMinutes: 10, now };
    const withTable = buildPlacedOrderFromSession({
      ...args,
      session: { ...session, fulfilmentMode: 'dine_in', table: { label: '7' } },
    });
    expect(withTable.table).toEqual({ label: '7' });
    expect(buildPlacedOrderFromSession({ ...args, session })).not.toHaveProperty('table');
  });

  it('copies the delivery address, fee and total', () => {
    const args = { paymentIntentId: 'pi_1', orderRef: 'AB3-K7P', autoRejectMinutes: 10, now };
    const order = buildPlacedOrderFromSession({
      ...args,
      session: { ...session, fulfilmentMode: 'delivery', deliveryAddress: DELIVERY_ADDRESS, charges: [FEE_CHARGE], totalCents: 2050 },
    });
    expect(order).toMatchObject({
      fulfilmentMode: 'delivery',
      deliveryAddress: DELIVERY_ADDRESS,
      charges: [FEE_CHARGE],
      totalCents: 2050,
      subtotalCents: 1800,
    });
    const plain = buildPlacedOrderFromSession({ ...args, session });
    expect('totalCents' in plain).toBe(false);
    expect('charges' in plain).toBe(false);
  });

  it('a scheduled order not yet due has no decline time', () => {
    const args = { paymentIntentId: 'pi_1', orderRef: 'AB3-K7P', autoRejectMinutes: 10, now };
    const order = buildPlacedOrderFromSession({
      ...args,
      session: { ...session, scheduledFor: '2026-10-05T16:00:00.000Z' },
      inLiveQueue: false,
    });
    expect(order.scheduledFor).toBe('2026-10-05T16:00:00.000Z');
    expect('autoRejectAt' in order).toBe(false);
    expect('queuedAt' in order).toBe(false);
  });

  it('a scheduled order already due starts its clock now', () => {
    const args = { paymentIntentId: 'pi_1', orderRef: 'AB3-K7P', autoRejectMinutes: 10, now };
    const order = buildPlacedOrderFromSession({
      ...args,
      session: { ...session, scheduledFor: '2026-10-05T16:00:00.000Z' },
      inLiveQueue: true,
    });
    expect(order.queuedAt).toBe('2026-10-05T10:00:00.000Z');
    expect(order.autoRejectAt).toBe('2026-10-05T10:10:00.000Z');
  });

  it('an as-soon-as-possible order carries no booked time or queue time', () => {
    const order = buildPlacedOrderFromSession({ session, paymentIntentId: 'pi_1', orderRef: 'AB3-K7P', autoRejectMinutes: 10, now });
    expect('queuedAt' in order).toBe(false);
    expect('scheduledFor' in order).toBe(false);
  });
});
