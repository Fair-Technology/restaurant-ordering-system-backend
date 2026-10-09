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
vi.mock('../../../src/application/usage/orderLimitWarnings', () => ({ notifyOrderLimitThresholds: vi.fn(async () => undefined) }));
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
import { buildInvoice } from '../../../src/domain/invoice/invoice';
import { findInvoiceById } from '../../../src/infrastructure/cosmos/invoice/CosmosInvoiceRepository';
import { findInvoicedOrdersWithRefunds } from '../../../src/infrastructure/cosmos/order/CosmosOrderRepository';
import { findShopById } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { sendEmail } from '../../../src/infrastructure/email/emailSender';
import { capturePaymentIntent, releaseAuthorization } from '../../../src/infrastructure/stripe/stripeClient';
import {
  ACCEPTED_CARD_ORDER,
  ACCEPTED_DELIVERY_ORDER,
  CARD_SHOP as DEFAULT_SHOP,
  orderStore,
  PLACED_CARD_ORDER,
  SCHEDULED_ORDER,
  SCHEDULED_SHOP,
  SLOT_1800,
} from '../../fixtures/orders';

// A restaurant that accepts by hand; without orderSettings a shop auto-accepts.
const CARD_SHOP = { ...DEFAULT_SHOP, orderSettings: { autoRejectMinutes: 10, alertEmail: null, autoAccept: false } };

const WINDOW_SHOP = {
  ...DEFAULT_SHOP,
  orderSettings: {
    autoAcceptHours: {
      mon: [{ open: '09:00', close: '18:00' }],
      tue: [], wed: [], thu: [], fri: [], sat: [], sun: [],
    },
  },
};
const placedAt = (iso: string, rejectIso: string) => ({
  ...PLACED_CARD_ORDER,
  createdAt: iso,
  autoRejectAt: rejectIso,
  history: [{ from: null, to: 'PLACED', at: iso, actor: { type: 'customer' } }],
});

const NO_EXTRAS = { autoAccepted: 0, queued: 0, released: 0, invoicesIssued: 0, correctionsIssued: 0 };

function storedOrder(order = PLACED_CARD_ORDER) {
  const store = orderStore(order);
  (findOrderWithEtag as any).mockImplementation(store.findOrderWithEtag);
  (replaceOrderIfMatch as any).mockImplementation(store.replaceOrderIfMatch);
  return store;
}

const MANUAL_SCHEDULED = { ...SCHEDULED_SHOP, orderSettings: { scheduledOrders: true, autoAccept: false } };

describe('executeProcessOrderTimers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (findShopById as any).mockResolvedValue(CARD_SHOP);
    (findPlacedOrdersCreatedBefore as any).mockResolvedValue([PLACED_CARD_ORDER]);
    (findOrdersInState as any).mockResolvedValue([]);
    (findOrdersAwaitingRelease as any).mockResolvedValue([]);
    (findOrdersMissingInvoice as any).mockResolvedValue([]);
    (findInvoicedOrdersWithRefunds as any).mockResolvedValue([]);
    (findInvoiceById as any).mockImplementation(async () => null);
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

  it('an order placed inside the automatic hours is still accepted after they end', async () => {
    const order = placedAt('2026-10-05T15:59:00.000Z', '2026-10-05T16:09:00.000Z');
    (findShopById as any).mockResolvedValue(WINDOW_SHOP);
    (findPlacedOrdersCreatedBefore as any).mockResolvedValue([order]);
    const store = storedOrder(order as any);
    const res = await executeProcessOrderTimers({ now: new Date('2026-10-05T16:01:00Z') });
    expect(capturePaymentIntent).toHaveBeenCalledTimes(1);
    expect(store.current.state).toBe('ACCEPTED');
    expect(res.autoAccepted).toBe(1);
  });

  it('an order placed in the manual hours waits for staff', async () => {
    const order = placedAt('2026-10-05T16:01:00.000Z', '2026-10-05T16:11:00.000Z');
    (findShopById as any).mockResolvedValue(WINDOW_SHOP);
    (findPlacedOrdersCreatedBefore as any).mockResolvedValue([order]);
    storedOrder(order as any);
    const res = await executeProcessOrderTimers({ now: new Date('2026-10-05T16:02:00Z') });
    expect(capturePaymentIntent).not.toHaveBeenCalled();
    expect(res).toEqual({ escalated: 0, autoRejected: 0, autoCompleted: 0, ...NO_EXTRAS });
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

  it('leaves a fresh order alone when the restaurant accepts by hand', async () => {
    const res = await executeProcessOrderTimers({ now: new Date('2026-10-05T10:01:00Z') });
    expect(replaceOrderIfMatch).not.toHaveBeenCalled();
    expect(capturePaymentIntent).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(res).toEqual({ escalated: 0, autoRejected: 0, autoCompleted: 0, ...NO_EXTRAS });
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
    (findOrdersInState as any).mockImplementation(async (s: string) => (s === 'READY' ? [ready] : []));
    storedOrder(ready);
    const res = await executeProcessOrderTimers({ now: new Date('2026-10-05T22:00:00Z') });
    const written = (replaceOrderIfMatch as any).mock.calls[0][0];
    expect(written.state).toBe('COMPLETED');
    expect(written.payment.status).toBe('paid');
    expect(res.autoCompleted).toBe(1);
  });

  it('completes an order out for delivery after midnight', async () => {
    const out = { ...ACCEPTED_DELIVERY_ORDER, state: 'OUT_FOR_DELIVERY' as const, readyAt: '2026-10-05T19:00:00.000Z' };
    (findPlacedOrdersCreatedBefore as any).mockResolvedValue([]);
    (findOrdersInState as any).mockImplementation(async (s: string) => (s === 'OUT_FOR_DELIVERY' ? [out] : []));
    storedOrder(out);
    const res = await executeProcessOrderTimers({ now: new Date('2026-10-05T22:00:00Z') });
    expect((replaceOrderIfMatch as any).mock.calls[0][0].state).toBe('COMPLETED');
    expect(res.autoCompleted).toBe(1);
  });

  it('issues a missing invoice, emails it once and looks back 7 days', async () => {
    const order = { ...ACCEPTED_CARD_ORDER, state: 'COMPLETED' as const };
    (findPlacedOrdersCreatedBefore as any).mockResolvedValue([]);
    (findOrdersMissingInvoice as any).mockResolvedValue([order]);
    const store = storedOrder(order);
    const now = new Date('2026-10-06T10:00:00Z');
    const res = await executeProcessOrderTimers({ now });
    expect((findOrdersMissingInvoice as any).mock.calls[0][0]).toBe('2026-09-29T10:00:00.000Z');
    expect(res.invoicesIssued).toBe(1);
    expect(store.current.invoiceNumber).toBe('R-2026-00001');
    expect(store.current.invoiceEmailedAt).toBe(now.toISOString());
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const mail = (sendEmail as any).mock.calls[0][0];
    expect(mail.to).toEqual([order.customerEmail]);
    expect(mail.attachments[0].name).toBe('Rechnung-R-2026-00001.pdf');

    // Next minute the order is still in the list (stale query result), but is not emailed again.
    (findInvoiceById as any).mockImplementation(async (_s: string, id: string) =>
      id === order.id ? buildInvoice({ order, shop: CARD_SHOP, number: 'R-2026-00001', now }) : null,
    );
    await executeProcessOrderTimers({ now: new Date('2026-10-06T10:01:00Z') });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('makes a missing correction invoice, emails it once and looks back 30 days', async () => {
    const order = {
      ...ACCEPTED_CARD_ORDER,
      state: 'COMPLETED' as const,
      invoiceNumber: 'R-2026-00001',
      payment: { ...ACCEPTED_CARD_ORDER.payment, status: 'partially_refunded' as const },
      refunds: [
        {
          id: 'r1',
          amountCents: 300,
          reason: 'cold',
          at: '2026-10-05T11:00:00.000Z',
          actor: { type: 'staff' as const, id: 'm1' },
          stripeRefundId: 're_1',
        },
      ],
    };
    const now = new Date('2026-10-06T10:00:00Z');
    const original = buildInvoice({ order, shop: CARD_SHOP, number: 'R-2026-00001', now: new Date('2026-10-05T10:05:00Z') });
    (findInvoiceById as any).mockImplementation(async (_s: string, id: string) => (id === order.id ? original : null));
    (findPlacedOrdersCreatedBefore as any).mockResolvedValue([]);
    (findInvoicedOrdersWithRefunds as any).mockResolvedValue([order]);
    const store = storedOrder(order);
    const res = await executeProcessOrderTimers({ now });
    expect((findInvoicedOrdersWithRefunds as any).mock.calls[0][0]).toBe('2026-09-06T10:00:00.000Z');
    expect(res.correctionsIssued).toBe(1);
    expect(store.current.refunds![0]).toEqual(
      expect.objectContaining({ correctionNumber: 'R-2026-00001', correctionKind: 'correction', correctionEmailedAt: now.toISOString() }),
    );
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect((sendEmail as any).mock.calls[0][0].attachments[0].name).toMatch(/^Rechnungskorrektur-R-2026-/);
  });

  describe('scheduled orders', () => {
    beforeEach(() => {
      (findShopById as any).mockResolvedValue(SCHEDULED_SHOP);
      (findPlacedOrdersCreatedBefore as any).mockResolvedValue([SCHEDULED_ORDER]);
    });

    it('a scheduled order waits quietly until it is due', async () => {
      storedOrder(SCHEDULED_ORDER);
      for (const at of ['2026-10-05T10:03:00Z', '2026-10-05T10:10:00Z', '2026-10-05T15:39:00Z']) {
        const res = await executeProcessOrderTimers({ now: new Date(at) });
        expect(res).toEqual({ escalated: 0, autoRejected: 0, autoCompleted: 0, ...NO_EXTRAS });
      }
      expect(replaceOrderIfMatch).not.toHaveBeenCalled();
      expect(capturePaymentIntent).not.toHaveBeenCalled();
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it('a scheduled order comes in one ready time before and is accepted then', async () => {
      const store = storedOrder(SCHEDULED_ORDER);
      const res = await executeProcessOrderTimers({ now: new Date('2026-10-05T15:40:00Z') });
      expect(store.current).toMatchObject({
        state: 'ACCEPTED',
        queuedAt: '2026-10-05T15:40:00.000Z',
        readyAt: SLOT_1800,
        prepMinutes: 20,
      });
      expect(res.queued).toBe(1);
      expect(res.autoAccepted).toBe(1);
    });

    it('a scheduled order for a restaurant accepting by hand gets fresh alert and decline times', async () => {
      (findShopById as any).mockResolvedValue(MANUAL_SCHEDULED);
      const store = storedOrder(SCHEDULED_ORDER);
      (findPlacedOrdersCreatedBefore as any).mockImplementation(async () => [store.current]);
      const entered = await executeProcessOrderTimers({ now: new Date('2026-10-05T15:40:00Z') });
      expect(store.current).toMatchObject({
        state: 'PLACED',
        queuedAt: '2026-10-05T15:40:00.000Z',
        autoRejectAt: '2026-10-05T15:50:00.000Z',
      });
      expect(entered.escalated).toBe(0);
      expect(sendEmail).not.toHaveBeenCalled();

      const alert = await executeProcessOrderTimers({ now: new Date('2026-10-05T15:43:00Z') });
      expect(alert.escalated).toBe(1);
      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Bestellung AB3-K7P wartet seit 3 Minuten auf Annahme',
          text: expect.stringContaining('Vorbestellt für: Montag, 5. Oktober, 18:00'),
        }),
      );

      const declined = await executeProcessOrderTimers({ now: new Date('2026-10-05T15:50:00Z') });
      expect(declined.autoRejected).toBe(1);
      expect(store.current.state).toBe('REJECTED');
      expect(store.current.history.at(-1)).toMatchObject({ actor: { type: 'system' }, reason: 'no_response' });
    });

    it('automatic hours are judged when a scheduled order comes in, not when it was booked', async () => {
      const shop = {
        ...SCHEDULED_SHOP,
        orderSettings: {
          scheduledOrders: true,
          autoAcceptHours: { mon: [{ open: '09:00', close: '18:00' }], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] },
        },
      };
      const order = { ...SCHEDULED_ORDER, createdAt: '2026-10-05T08:00:00.000Z', scheduledFor: '2026-10-05T17:00:00.000Z' };
      (findShopById as any).mockResolvedValue(shop);
      (findPlacedOrdersCreatedBefore as any).mockResolvedValue([order]);
      const store = storedOrder(order);
      await executeProcessOrderTimers({ now: new Date('2026-10-05T16:40:00Z') });
      expect(capturePaymentIntent).not.toHaveBeenCalled();
      expect(store.current.queuedAt).toBe('2026-10-05T16:40:00.000Z');
      expect(store.current.state).toBe('PLACED');
    });

    it('a booked time now closed is not accepted automatically', async () => {
      (findShopById as any).mockResolvedValue({
        ...SCHEDULED_SHOP,
        closures: [{ id: 'c', start: '2026-10-05T15:00:00.000Z', end: '2026-10-05T18:00:00.000Z' }],
      });
      const store = storedOrder(SCHEDULED_ORDER);
      const res = await executeProcessOrderTimers({ now: new Date('2026-10-05T15:40:00Z') });
      expect(capturePaymentIntent).not.toHaveBeenCalled();
      expect(res.queued).toBe(1);
      expect(store.current.state).toBe('PLACED');
    });
  });
});
