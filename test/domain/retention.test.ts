import { describe, it, expect } from 'vitest';
import {
  DEFAULT_DELIVERY_ADDRESS_RETENTION_DAYS,
  DELIVERY_ADDRESS_RETENTION_DAYS_SETTING,
  blankDeliveryAddress,
  deliveryAddressRetentionDays,
  isDeliveryAddressExpired,
} from '../../src/domain/legal/retention';
import { ACCEPTED_CARD_ORDER, ADDRESS, DELIVERY_ADDRESS } from '../fixtures/orders';
import type { Order } from '../../src/domain/order/Order';

const DAY = 24 * 60 * 60 * 1000;
const CREATED = '2026-01-01T12:00:00.000Z';
const at = (days: number) => new Date(Date.parse(CREATED) + days * DAY);

const withAddress: Pick<Order, 'deliveryAddress' | 'createdAt'> = { deliveryAddress: DELIVERY_ADDRESS, createdAt: CREATED };

describe('deliveryAddressRetentionDays', () => {
  it('defaults to the provisional 180 when unset (pending owner confirmation)', () => {
    expect(deliveryAddressRetentionDays({})).toBe(180);
    expect(DEFAULT_DELIVERY_ADDRESS_RETENTION_DAYS).toBe(180);
  });

  it('reads the configured window and never hard-codes it', () => {
    expect(deliveryAddressRetentionDays({ [DELIVERY_ADDRESS_RETENTION_DAYS_SETTING]: '30' })).toBe(30);
    expect(deliveryAddressRetentionDays({ [DELIVERY_ADDRESS_RETENTION_DAYS_SETTING]: '0' })).toBe(0);
    expect(deliveryAddressRetentionDays({ [DELIVERY_ADDRESS_RETENTION_DAYS_SETTING]: '365' })).toBe(365);
  });

  it('falls back to the default on a blank or unreadable value', () => {
    for (const bad of ['', '  ', 'soon', '-1', 'NaN']) {
      expect(deliveryAddressRetentionDays({ [DELIVERY_ADDRESS_RETENTION_DAYS_SETTING]: bad })).toBe(180);
    }
  });
});

describe('isDeliveryAddressExpired', () => {
  it('is due from exactly the window boundary, and not a millisecond earlier', () => {
    expect(isDeliveryAddressExpired(withAddress, at(179), 180)).toBe(false);
    expect(isDeliveryAddressExpired(withAddress, new Date(at(180).getTime() - 1), 180)).toBe(false);
    expect(isDeliveryAddressExpired(withAddress, at(180), 180)).toBe(true);
    expect(isDeliveryAddressExpired(withAddress, at(1000), 180)).toBe(true);
  });

  it('fails safe: no address to blank, or an unreadable createdAt, is never due', () => {
    expect(isDeliveryAddressExpired({ createdAt: CREATED }, at(1000), 180)).toBe(false);
    expect(isDeliveryAddressExpired({ deliveryAddress: undefined, createdAt: CREATED }, at(1000), 180)).toBe(false);
    expect(isDeliveryAddressExpired({ deliveryAddress: DELIVERY_ADDRESS, createdAt: 'garbage' }, at(1000), 180)).toBe(false);
  });
});

describe('blankDeliveryAddress', () => {
  it('removes only the delivery address and leaves every other field identical', () => {
    const order = {
      ...ACCEPTED_CARD_ORDER,
      id: 'o-b',
      fulfilmentMode: 'delivery' as const,
      deliveryAddress: DELIVERY_ADDRESS,
      customerAddress: ADDRESS,
    };
    const blanked = blankDeliveryAddress(order);

    expect(blanked.deliveryAddress).toBeUndefined();
    expect('deliveryAddress' in blanked).toBe(false);
    // The billing address is the protected field: it must survive this window untouched.
    expect(blanked.customerAddress).toEqual(order.customerAddress);
    expect(blanked.customerEmail).toBe(order.customerEmail);
    expect(blanked.customerName).toBe(order.customerName);
    expect(blanked.updatedAt).toBe(order.updatedAt);
    expect(blanked.anonymisedAt).toBeUndefined();
  });
});
