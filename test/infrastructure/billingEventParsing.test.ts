import { describe, it, expect } from 'vitest';
import {
  invoiceSubscriptionId,
  isStripeCardError,
  subscriptionPeriod,
  subscriptionPriceId,
} from '../../src/infrastructure/stripe/billingEventParsing';

describe('billing event parsing', () => {
  it('reads the period from the item (current API)', () => {
    const sub = { items: { data: [{ current_period_start: 1790000000, current_period_end: 1792592000, price: { id: 'price_pro_m' } }] } };
    expect(subscriptionPeriod(sub)).toEqual({ start: '2026-09-21T14:13:20.000Z', end: '2026-10-21T14:13:20.000Z' });
    expect(subscriptionPriceId(sub)).toBe('price_pro_m');
  });

  it('falls back to the old top-level period', () => {
    expect(subscriptionPeriod({ current_period_start: 1790000000, current_period_end: 1792592000 })).toEqual({
      start: '2026-09-21T14:13:20.000Z',
      end: '2026-10-21T14:13:20.000Z',
    });
  });

  it('finds the invoice\'s subscription in either shape', () => {
    expect(invoiceSubscriptionId({ parent: { subscription_details: { subscription: 'sub_1' } } })).toBe('sub_1');
    expect(invoiceSubscriptionId({ subscription: 'sub_2' })).toBe('sub_2');
    expect(invoiceSubscriptionId({ parent: { subscription_details: { subscription: { id: 'sub_3' } } } })).toBe('sub_3');
    expect(invoiceSubscriptionId({})).toBeNull();
  });

  it('recognises a card error', () => {
    expect(isStripeCardError({ type: 'StripeCardError' })).toBe(true);
    expect(isStripeCardError(new Error('x'))).toBe(false);
  });
});
