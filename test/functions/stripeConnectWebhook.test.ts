import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ handlers: {} as Record<string, any>, constructEvent: vi.fn(), record: vi.fn() }));

vi.mock('@azure/functions', () => ({
  app: {
    http: (name: string, o: any) => {
      m.handlers[name] = o.handler;
    },
  },
}));
vi.mock('../../src/infrastructure/stripe/stripeClient', () => ({
  getStripe: () => ({ webhooks: { constructEvent: m.constructEvent } }),
}));
vi.mock('../../src/application/order/handlePaymentAuthorized/executeHandlePaymentAuthorized', () => ({
  executeHandlePaymentAuthorized: vi.fn(),
}));
vi.mock('../../src/application/order/paymentIntentUpdates/executePaymentIntentUpdates', () => ({
  executePaymentIntentUpdates: vi.fn(),
}));
vi.mock('../../src/application/order/stripeRefunds/executeRecordStripeRefunds', () => ({
  executeRecordStripeRefunds: m.record,
}));
vi.mock('../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({
  findShopByStripeConnectAccountId: vi.fn(),
  updateShop: vi.fn(),
}));

import '../../src/functions/order/stripeConnectWebhook/index';

let savedKey: string | undefined;
let savedSecret: string | undefined;

beforeEach(() => {
  savedKey = process.env.STRIPE_SECRET_KEY;
  savedSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_x';
  vi.clearAllMocks();
});

afterEach(() => {
  if (savedKey === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = savedKey;
  if (savedSecret === undefined) delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  else process.env.STRIPE_CONNECT_WEBHOOK_SECRET = savedSecret;
});

const req = { arrayBuffer: async () => new ArrayBuffer(0), headers: new Headers({ 'stripe-signature': 'sig' }) };
const call = () => m.handlers.stripeConnectWebhook(req);
const refundedEvent = (payment_intent: string | null) => ({
  type: 'charge.refunded',
  account: 'acct_1',
  data: { object: { id: 'ch_1', payment_intent } },
});

describe('stripeConnectWebhook', () => {
  it('hands a refunded charge to the refund sync', async () => {
    m.constructEvent.mockReturnValue(refundedEvent('pi_1'));
    m.record.mockResolvedValue('recorded');
    const res = await call();
    expect(res.status).toBe(200);
    expect(m.record).toHaveBeenCalledWith({ paymentIntentId: 'pi_1', connectAccountId: 'acct_1' });
  });

  it('a charge without a payment is ignored', async () => {
    m.constructEvent.mockReturnValue(refundedEvent(null));
    const res = await call();
    expect(res.status).toBe(200);
    expect(m.record).not.toHaveBeenCalled();
  });

  it('a failed refund sync asks Stripe to retry', async () => {
    m.constructEvent.mockReturnValue(refundedEvent('pi_1'));
    m.record.mockRejectedValue(new Error('x'));
    const res = await call();
    expect(res.status).toBe(500);
  });
});
