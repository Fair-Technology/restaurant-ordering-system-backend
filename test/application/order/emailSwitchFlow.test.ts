import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Boundaries only: Cosmos repos, Stripe, the ACS client and the system-config read. sendEmail/the gate are real.
const beginSend = vi.fn();
vi.mock('@azure/communication-email', () => ({ EmailClient: vi.fn(function (this: any) { this.beginSend = beginSend; }) }));
vi.mock('../../../src/infrastructure/cosmos/system/CosmosSystemConfigRepository', () => ({ getSystemConfig: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/usage/CosmosSlotPlacesRepository', () => ({
  findSlotPlacesWithEtag: vi.fn(async () => null),
  createSlotPlaces: vi.fn(async () => 'ok'),
  replaceSlotPlacesIfMatch: vi.fn(async () => 'ok'),
}));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({ findShopById: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/order/CosmosCheckoutSessionRepository', () => ({
  findCheckoutSessionById: vi.fn(async () => null),
}));
vi.mock('../../../src/infrastructure/cosmos/order/CosmosOrderRepository', () => ({
  findOrderById: vi.fn(),
  findOrderWithEtag: vi.fn(),
  replaceOrderIfMatch: vi.fn(),
}));
vi.mock('../../../src/infrastructure/stripe/stripeClient', () => ({
  capturePaymentIntent: vi.fn(async () => undefined),
  releaseAuthorization: vi.fn(async () => 'canceled'),
  createRefund: vi.fn(async () => ({ id: 're_1' })),
  listPaymentRefunds: vi.fn(async () => []),
  isRetryableStripeError: () => false,
}));
vi.mock('../../../src/infrastructure/cosmos/user/CosmosUserRepository', () => ({ findUserById: vi.fn(async () => ({ email: 'owner@example.test' })) }));
vi.mock('../../../src/application/_shared/entitlements', () => ({ loadEntitlements: vi.fn(async () => ({})) }));
vi.mock('../../../src/domain/subscription/entitlements', () => ({ limitOf: vi.fn(() => 30) }));
vi.mock('../../../src/application/order/reconcile/reconcileCheckoutSession', () => ({ reconcileCheckoutSession: vi.fn() }));

import { executeCancelCustomerOrder } from '../../../src/application/order/customer/executeCancelCustomerOrder';
import { executeGetCustomerOrder } from '../../../src/application/order/customer/executeGetCustomerOrder';
import { notifyCustomer } from '../../../src/application/order/notifications/notifyOrder';
import { notifyOrderLimitThresholds } from '../../../src/application/usage/orderLimitWarnings';
import { findOrderById, findOrderWithEtag, replaceOrderIfMatch } from '../../../src/infrastructure/cosmos/order/CosmosOrderRepository';
import { findShopById } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { getSystemConfig } from '../../../src/infrastructure/cosmos/system/CosmosSystemConfigRepository';
import { CARD_SHOP, orderStore, PLACED_CARD_ORDER } from '../../fixtures/orders';

const TOKEN = 'T'.repeat(32);
const now = new Date('2026-10-05T10:05:00Z');
const ENV = ['EMAIL_TRANSPORT', 'ACS_EMAIL_CONNECTION_STRING', 'ACS_EMAIL_SENDER'] as const;
const saved: Record<string, string | undefined> = {};
const config = (emailEnabled: boolean) => vi.mocked(getSystemConfig).mockResolvedValue({ id: 'global', maxShopsDefault: 3, emailEnabled, updatedAt: 'x' });

beforeEach(() => {
  for (const k of ENV) saved[k] = process.env[k];
  process.env.EMAIL_TRANSPORT = 'acs';
  process.env.ACS_EMAIL_CONNECTION_STRING = 'endpoint=https://x/;accesskey=k';
  process.env.ACS_EMAIL_SENDER = 'noreply@example.test';
  vi.clearAllMocks();
  beginSend.mockResolvedValue({});
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const store = orderStore(PLACED_CARD_ORDER);
  (findOrderById as any).mockResolvedValue(PLACED_CARD_ORDER);
  (findOrderWithEtag as any).mockImplementation(store.findOrderWithEtag);
  (replaceOrderIfMatch as any).mockImplementation(store.replaceOrderIfMatch);
  (findShopById as any).mockResolvedValue(CARD_SHOP);
});
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

describe('the switch lives only in sendEmail', () => {
  it('switch off: a diner email and a limit warning both send nothing, with no gate of their own', async () => {
    config(false);
    await notifyCustomer('order_cancelled', PLACED_CARD_ORDER, CARD_SHOP);
    await notifyOrderLimitThresholds(CARD_SHOP, { acceptedOrderCount: 24 } as any, now);
    expect(getSystemConfig).toHaveBeenCalledTimes(2); // each reached sendEmail and was stopped there
    expect(beginSend).not.toHaveBeenCalled();
  });

  it('switch on: both do send', async () => {
    config(true);
    await notifyCustomer('order_cancelled', PLACED_CARD_ORDER, CARD_SHOP);
    await notifyOrderLimitThresholds(CARD_SHOP, { acceptedOrderCount: 24 } as any, now);
    expect(beginSend).toHaveBeenCalledTimes(2);
  });
});

describe('email never fails an order', () => {
  it('cancel still succeeds when the config read throws', async () => {
    vi.mocked(getSystemConfig).mockRejectedValue(new Error('cosmos down'));
    const res = await executeCancelCustomerOrder({ orderId: 'o1', token: TOKEN }, { now });
    expect(res.ok).toBe(true);
    expect(beginSend).not.toHaveBeenCalled();
    if (res.ok) expect(res.data.emailsEnabled).toBe(false);
  });

  it('cancel still succeeds when the send itself throws (429)', async () => {
    config(true);
    beginSend.mockRejectedValue(Object.assign(new Error('Too Many Requests'), { statusCode: 429 }));
    const res = await executeCancelCustomerOrder({ orderId: 'o1', token: TOKEN }, { now });
    expect(res.ok).toBe(true);
  });
});

describe('emailsEnabled on the customer order', () => {
  const emailsEnabled = async () => {
    const res = await executeGetCustomerOrder({ orderId: 'o1', token: TOKEN }, { now });
    return res.ok ? res.data.emailsEnabled : undefined;
  };

  it('true only when the switch is on and the transport is acs', async () => {
    config(true);
    expect(await emailsEnabled()).toBe(true);
  });
  it('false when the switch is off', async () => {
    config(false);
    expect(await emailsEnabled()).toBe(false);
  });
  it('false when the transport is not configured', async () => {
    config(true);
    delete process.env.EMAIL_TRANSPORT;
    expect(await emailsEnabled()).toBe(false);
  });
  it('false when the config read throws', async () => {
    vi.mocked(getSystemConfig).mockRejectedValue(new Error('cosmos down'));
    expect(await emailsEnabled()).toBe(false);
  });
});
