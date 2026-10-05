import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({ findShopById: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/order/CosmosOrderRepository', () => ({
  findPlacedOrdersCreatedBefore: vi.fn(),
  findOrdersInState: vi.fn(),
  findOrdersAwaitingRelease: vi.fn(),
  findOrdersMissingInvoice: vi.fn(async () => []),
  findInvoicedOrdersWithRefunds: vi.fn(async () => []),
  findOrderWithEtag: vi.fn(),
  replaceOrderIfMatch: vi.fn(),
}));
vi.mock('../../../src/infrastructure/cosmos/invoice/CosmosInvoiceRepository', () => ({
  findInvoiceById: vi.fn(async () => null),
  findInvoiceCounter: vi.fn(async () => null),
  commitInvoice: vi.fn(async () => 'ok'),
}));
vi.mock('../../../src/infrastructure/cosmos/usage/CosmosUsageRepository', () => ({ incrementAcceptedOrders: vi.fn() }));
vi.mock('../../../src/infrastructure/pdf/invoicePdf', () => ({ renderInvoicePdf: vi.fn(async () => new Uint8Array([1])) }));
vi.mock('../../../src/infrastructure/stripe/stripeClient', () => ({
  capturePaymentIntent: vi.fn(async () => undefined),
  releaseAuthorization: vi.fn(async () => 'canceled'),
  createRefund: vi.fn(async () => ({ id: 're_1' })),
  isRetryableStripeError: (e: any) => ['StripeConnectionError', 'StripeAPIError', 'StripeRateLimitError'].includes(e?.type),
}));
vi.mock('../../../src/infrastructure/email/emailSender', () => ({
  sendEmail: vi.fn(async () => undefined),
  emailTransportName: () => 'log',
}));

import { executeProcessOrderTimers } from '../../../src/application/order/timers/executeProcessOrderTimers';
import {
  findOrderWithEtag,
  findOrdersAwaitingRelease,
  findOrdersInState,
  findOrdersMissingInvoice,
  findPlacedOrdersCreatedBefore,
  replaceOrderIfMatch,
} from '../../../src/infrastructure/cosmos/order/CosmosOrderRepository';
import { findShopById } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { sendEmail } from '../../../src/infrastructure/email/emailSender';
import { capturePaymentIntent, releaseAuthorization } from '../../../src/infrastructure/stripe/stripeClient';
import { ACCEPTED_CARD_ORDER, CARD_SHOP as DEFAULT_SHOP, orderStore, PLACED_CARD_ORDER } from '../../fixtures/orders';

// A restaurant that accepts by hand; without orderSettings a shop auto-accepts.
const CARD_SHOP = { ...DEFAULT_SHOP, orderSettings: { autoRejectMinutes: 10, alertEmail: null, autoAccept: false } };

const NO_EXTRAS = { autoAccepted: 0, released: 0, invoicesIssued: 0, correctionsIssued: 0 };

function storedOrder(order = PLACED_CARD_ORDER) {
  const store = orderStore(order);
  (findOrderWithEtag as any).mockImplementation(store.findOrderWithEtag);
  (replaceOrderIfMatch as any).mockImplementation(store.replaceOrderIfMatch);
  return store;
}

describe('executeProcessOrderTimers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (findShopById as any).mockResolvedValue(CARD_SHOP);
    (findPlacedOrdersCreatedBefore as any).mockResolvedValue([PLACED_CARD_ORDER]);
    (findOrdersInState as any).mockResolvedValue([]);
    (findOrdersAwaitingRelease as any).mockResolvedValue([]);
    (findOrdersMissingInvoice as any).mockResolvedValue([]);
    (capturePaymentIntent as any).mockResolvedValue(undefined);
    storedOrder();
  });

  it('accepts a missed order for an auto-accept restaurant', async () => {
    (findShopById as any).mockResolvedValue(DEFAULT_SHOP); // no orderSettings: auto-accept is the default
    const store = storedOrder();
    const res = await executeProcessOrderTimers({ now: new Date('2026-10-05T10:01:00Z') });
    expect(capturePaymentIntent).toHaveBeenCalledTimes(1);
    expect(store.current.state).toBe('ACCEPTED');
    expect(store.current.payment.status).toBe('paid');
    expect(res.autoAccepted).toBe(1);
    expect(res.escalated).toBe(0);
  });

  it('leaves an auto-accept order waiting when the payment service is down, and still declines it at the timeout', async () => {
    (findShopById as any).mockResolvedValue(DEFAULT_SHOP);
    (capturePaymentIntent as any).mockRejectedValue({ type: 'StripeConnectionError' });
    const store = storedOrder();
    const waiting = await executeProcessOrderTimers({ now: new Date('2026-10-05T10:01:00Z') });
    expect(waiting.autoAccepted).toBe(0);
    expect(store.current.state).toBe('PLACED');
    const late = await executeProcessOrderTimers({ now: new Date('2026-10-05T10:10:00Z') });
    expect(late.autoRejected).toBe(1);
    expect(store.current.state).toBe('REJECTED');
  });

  it('issues the invoice an accepted order is missing', async () => {
    (findPlacedOrdersCreatedBefore as any).mockResolvedValue([]);
    (findOrdersMissingInvoice as any).mockResolvedValue([ACCEPTED_CARD_ORDER]);
    storedOrder(ACCEPTED_CARD_ORDER);
    const res = await executeProcessOrderTimers({ now: new Date('2026-10-05T10:30:00Z') });
    expect(findOrdersMissingInvoice).toHaveBeenCalledWith('2026-09-28T10:30:00.000Z');
    expect(res.invoicesIssued).toBe(1);
    expect((replaceOrderIfMatch as any).mock.calls[0][0].invoiceNumber).toMatch(/^R-2026-/);
  });

  it('escalates an order waiting three minutes', async () => {
    const res = await executeProcessOrderTimers({ now: new Date('2026-10-05T10:03:00Z') });
    expect((replaceOrderIfMatch as any).mock.calls[0][0].escalatedAt).toBe('2026-10-05T10:03:00.000Z');
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['info@mapasta.example'],
        subject: 'Bestellung AB3-K7P wartet seit 3 Minuten auf Annahme',
      }),
    );
    expect(res).toEqual({ escalated: 1, autoRejected: 0, autoCompleted: 0, ...NO_EXTRAS });
  });

  it('escalation also goes to the alert address', async () => {
    (findShopById as any).mockResolvedValue({
      ...CARD_SHOP,
      orderSettings: { autoRejectMinutes: 10, alertEmail: 'boss@mapasta.example', autoAccept: false },
    });
    await executeProcessOrderTimers({ now: new Date('2026-10-05T10:03:00Z') });
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: ['info@mapasta.example', 'boss@mapasta.example'] }),
    );
  });

  it('auto-rejects at the timeout', async () => {
    const store = storedOrder();
    const res = await executeProcessOrderTimers({ now: new Date('2026-10-05T10:10:00Z') });
    const written = (replaceOrderIfMatch as any).mock.calls[0][0];
    expect(written.state).toBe('REJECTED');
    expect(releaseAuthorization).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'release-o1' }));
    expect(store.current.payment.status).toBe('canceled');
    expect(written.history.at(-1)).toMatchObject({ actor: { type: 'system' }, reason: 'no_response' });
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Ma Pasta: Bestellung AB3-K7P abgelehnt',
        text: expect.stringContaining('Es wurde nichts abgebucht.'),
      }),
    );
    expect(res.autoRejected).toBe(1);
  });

  it('leaves an order alone while an accept is taking its payment', async () => {
    storedOrder({ ...PLACED_CARD_ORDER, captureStartedAt: '2026-10-05T10:09:30.000Z' });
    const res = await executeProcessOrderTimers({ now: new Date('2026-10-05T10:10:00Z') });
    expect(res.autoRejected).toBe(0);
    expect(replaceOrderIfMatch).not.toHaveBeenCalled();
    expect(releaseAuthorization).not.toHaveBeenCalled();
  });

  it('retries a release that failed 15 minutes ago', async () => {
    const stuck = {
      ...PLACED_CARD_ORDER,
      state: 'REJECTED' as const,
      releaseFailure: { at: '2026-10-05T10:00:00.000Z', message: 'API down', notifiedAt: '2026-10-05T10:00:00.000Z' },
    };
    (findPlacedOrdersCreatedBefore as any).mockResolvedValue([]);
    (findOrdersAwaitingRelease as any).mockResolvedValue([stuck]);
    const store = storedOrder(stuck);
    const res = await executeProcessOrderTimers({ now: new Date('2026-10-05T10:15:00Z') });
    expect(res.released).toBe(1);
    expect(store.current.payment.status).toBe('canceled');
  });

  it('waits before retrying a fresh release failure', async () => {
    const stuck = {
      ...PLACED_CARD_ORDER,
      state: 'REJECTED' as const,
      releaseFailure: { at: '2026-10-05T10:00:00.000Z', message: 'API down', notifiedAt: '2026-10-05T10:00:00.000Z' },
    };
    (findPlacedOrdersCreatedBefore as any).mockResolvedValue([]);
    (findOrdersAwaitingRelease as any).mockResolvedValue([stuck]);
    const res = await executeProcessOrderTimers({ now: new Date('2026-10-05T10:14:59Z') });
    expect(res.released).toBe(0);
    expect(releaseAuthorization).not.toHaveBeenCalled();
  });

  it('skips an order someone just accepted', async () => {
    (replaceOrderIfMatch as any).mockResolvedValue('conflict');
    const res = await executeProcessOrderTimers({ now: new Date('2026-10-05T10:10:00Z') });
    expect(res.autoRejected).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('completes a ready order after midnight', async () => {
    const ready = {
      ...PLACED_CARD_ORDER,
      state: 'READY' as const,
      payment: { ...PLACED_CARD_ORDER.payment, status: 'paid' as const },
      readyAt: '2026-10-05T19:00:00.000Z',
    };
    (findPlacedOrdersCreatedBefore as any).mockResolvedValue([]);
    (findOrdersInState as any).mockResolvedValue([ready]);
    storedOrder(ready);
    const res = await executeProcessOrderTimers({ now: new Date('2026-10-05T22:00:00Z') });
    const written = (replaceOrderIfMatch as any).mock.calls[0][0];
    expect(written.state).toBe('COMPLETED');
    expect(written.payment.status).toBe('paid');
    expect(res.autoCompleted).toBe(1);
  });
});
