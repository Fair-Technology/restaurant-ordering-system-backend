import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildInvoice } from '../../../src/domain/invoice/invoice';
import type { InvoiceDoc } from '../../../src/domain/invoice/invoice';
import type { Order } from '../../../src/domain/order/Order';
import {
  REFUND_AMOUNT_ERROR,
  REFUND_FAILED_PREFIX,
  REFUND_MODE_ERROR,
  REFUND_RATE_EXCEEDED_ERROR,
  REFUND_REASON_ERROR,
  REFUND_STATE_ERROR,
} from '../../../src/domain/order/orderErrors';
import { ACCEPTED_CARD_ORDER, ACCEPTED_TWO_LINE_ORDER, CARD_SHOP, orderStore } from '../../fixtures/orders';

const m = vi.hoisted(() => ({
  authorizeShopAction: vi.fn(),
  findShopById: vi.fn(),
  createRefund: vi.fn(),
  findInvoiceById: vi.fn(),
  findInvoiceCounter: vi.fn(),
  commitInvoice: vi.fn(),
  sendEmail: vi.fn(),
  logAudit: vi.fn(),
  store: null as any,
}));

vi.mock('../../../src/application/_shared/shopAccess', () => ({
  authorizeShopAction: m.authorizeShopAction,
  toAuditActor: (a: any) => ({ actorType: a.actorType, actorId: a.actorId }),
}));
vi.mock('../../../src/application/_shared/auditHelpers', () => ({ logAudit: m.logAudit }));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({ findShopById: m.findShopById }));
vi.mock('../../../src/infrastructure/cosmos/order/CosmosOrderRepository', () => ({
  findOrderWithEtag: (...a: unknown[]) => m.store.findOrderWithEtag(...a),
  replaceOrderIfMatch: (...a: unknown[]) => m.store.replaceOrderIfMatch(...a),
}));
vi.mock('../../../src/infrastructure/cosmos/invoice/CosmosInvoiceRepository', () => ({
  findInvoiceById: m.findInvoiceById,
  findInvoiceCounter: m.findInvoiceCounter,
  commitInvoice: m.commitInvoice,
}));
vi.mock('../../../src/infrastructure/stripe/stripeClient', () => ({ createRefund: m.createRefund }));
vi.mock('../../../src/infrastructure/email/emailSender', () => ({
  sendEmail: m.sendEmail,
  emailTransportName: () => 'log',
}));

import { executeRefundOrder } from '../../../src/application/order/refunds/executeRefundOrder';

const http = {} as any;
const now = new Date('2026-10-05T12:00:00Z');
const ids = { shopId: 'shop-1', orderId: 'o1' };
const MANAGER = {
  ok: true,
  actor: { actorType: 'staff', actorId: 'm1', role: 'manager' },
  permissions: ['view_orders', 'refund_orders'],
};

const completed: Order = { ...ACCEPTED_CARD_ORDER, state: 'COMPLETED', invoiceNumber: 'R-2026-00001' };
const two: Order = { ...ACCEPTED_TWO_LINE_ORDER, state: 'COMPLETED', invoiceNumber: 'R-2026-00001' };

function setup(order: Order) {
  m.store = orderStore(order);
  const original: InvoiceDoc = buildInvoice({ order, shop: CARD_SHOP, number: 'R-2026-00001', now: new Date('2026-10-05T10:05:00Z') });
  m.findInvoiceById.mockImplementation(async (_shop: string, id: string) => (id === order.id ? original : null));
}

function priorRefund(amountCents: number, extra: Partial<Order['refunds'] extends (infer R)[] | undefined ? R : never> = {}) {
  return {
    id: 'r0',
    amountCents,
    reason: 'earlier',
    at: '2026-10-05T11:00:00.000Z',
    actor: { type: 'staff' as const, id: 'm1' },
    stripeRefundId: 're_0',
    ...extra,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  m.authorizeShopAction.mockResolvedValue(MANAGER);
  m.findShopById.mockResolvedValue(CARD_SHOP);
  m.createRefund.mockResolvedValue({ id: 're_1' });
  m.findInvoiceCounter.mockResolvedValue({
    counter: { id: 'counter', shopId: 'shop-1', kind: 'counter', year: '2026', nextNumber: 2, updatedAt: 'x' },
    etag: 'c-1',
  });
  m.commitInvoice.mockResolvedValue('ok');
  m.sendEmail.mockResolvedValue(undefined);
  m.logAudit.mockResolvedValue(undefined);
});

describe('executeRefundOrder', () => {
  it('a manager refunds part of a completed order', async () => {
    setup(completed);
    const res = await executeRefundOrder({ ...ids, amountCents: 300, reason: 'Pizza kalt' }, http, { now });
    expect(res.ok).toBe(true);
    expect(m.authorizeShopAction).toHaveBeenCalledWith(http, CARD_SHOP, 'refund_orders');
    expect(m.createRefund).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 300, idempotencyKey: 'refund-o1-0-300' }),
    );
    const stored = m.store.current as Order;
    expect(stored.payment.status).toBe('partially_refunded');
    expect(stored.refunds).toHaveLength(1);
    expect(stored.refunds![0]).toEqual(
      expect.objectContaining({ amountCents: 300, reason: 'Pizza kalt', actor: { type: 'staff', id: 'm1' }, stripeRefundId: 're_1' }),
    );
    expect(stored.refunds![0]).not.toHaveProperty('lines');
    expect(m.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'order.refund',
        entityType: 'order',
        entityId: 'o1',
        changes: [{ field: 'refundedCents', from: 0, to: 300 }],
      }),
    );
    expect(m.commitInvoice).toHaveBeenCalledWith(
      expect.anything(),
      'c-1',
      expect.objectContaining({ id: 'o1-c1', number: 'R-2026-00002', documentType: 'correction' }),
    );
    expect(m.sendEmail.mock.calls[0][0].attachments[0].name).toBe('Rechnungskorrektur-R-2026-00002.pdf');
    if (res.ok) {
      expect(res.data.documents.map((d) => d.number)).toEqual(['R-2026-00001', 'R-2026-00002']);
      expect(res.data.refunds[0].lines).toEqual([]);
    }
  });

  it('a full refund makes a Stornorechnung', async () => {
    setup(completed);
    const res = await executeRefundOrder({ ...ids, amountCents: 1050, reason: 'Alles falsch' }, http, { now });
    expect(res.ok).toBe(true);
    expect((m.store.current as Order).payment.status).toBe('refunded');
    expect(m.commitInvoice).toHaveBeenCalledWith(
      expect.anything(),
      'c-1',
      expect.objectContaining({ documentType: 'cancellation' }),
    );
    expect(m.sendEmail.mock.calls[0][0].attachments[0].name).toBe('Stornorechnung-R-2026-00002.pdf');
  });

  it('refunding the rest after a partial refund is a correction, not a Stornorechnung', async () => {
    setup({ ...completed, payment: { ...completed.payment, status: 'partially_refunded' }, refunds: [priorRefund(300)] });
    const res = await executeRefundOrder({ ...ids, amountCents: 750, reason: 'Rest' }, http, { now });
    expect(res.ok).toBe(true);
    const stored = m.store.current as Order;
    expect(stored.payment.status).toBe('refunded');
    expect(m.createRefund).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'refund-o1-1-750' }));
    expect(m.commitInvoice).toHaveBeenCalledWith(
      expect.anything(),
      'c-1',
      expect.objectContaining({ id: 'o1-c2', documentType: 'correction' }),
    );
  });

  it('refuses more than is left', async () => {
    setup(completed);
    const res = await executeRefundOrder({ ...ids, amountCents: 1051, reason: 'x' }, http, { now });
    expect(res).toEqual({ ok: false, code: 'INVALID_INPUT', error: REFUND_AMOUNT_ERROR });
    expect(m.createRefund).not.toHaveBeenCalled();
  });

  it('refuses an order whose money was never taken', async () => {
    setup({ ...ACCEPTED_CARD_ORDER, payment: { ...ACCEPTED_CARD_ORDER.payment, status: 'authorized' } });
    const res = await executeRefundOrder({ ...ids, amountCents: 100, reason: 'x' }, http, { now });
    expect(res).toEqual({ ok: false, code: 'CONFLICT', error: REFUND_STATE_ERROR });
    expect(m.createRefund).not.toHaveBeenCalled();
  });

  it('needs a reason', async () => {
    setup(completed);
    for (const reason of [undefined, '   ', 'x'.repeat(201)]) {
      const res = await executeRefundOrder({ ...ids, amountCents: 100, reason: reason as any }, http, { now });
      expect(res).toEqual({ ok: false, code: 'INVALID_INPUT', error: REFUND_REASON_ERROR });
    }
    expect(m.createRefund).not.toHaveBeenCalled();
  });

  it('only people allowed to refund', async () => {
    setup(completed);
    m.authorizeShopAction.mockResolvedValue({ ok: false, code: 'FORBIDDEN', error: 'Insufficient permissions' });
    const res = await executeRefundOrder({ ...ids, amountCents: 100, reason: 'x' }, http, { now });
    expect(res).toEqual({ ok: false, code: 'FORBIDDEN', error: 'Insufficient permissions' });
    expect(m.createRefund).not.toHaveBeenCalled();
  });

  it('Stripe refusing the refund is reported', async () => {
    setup(completed);
    m.createRefund.mockRejectedValue(new Error('charge already refunded'));
    const res = await executeRefundOrder({ ...ids, amountCents: 100, reason: 'x' }, http, { now });
    expect(res).toEqual({ ok: false, code: 'INVALID_INPUT', error: `${REFUND_FAILED_PREFIX}charge already refunded` });
    expect((m.store.current as Order).refunds).toBeUndefined();
    expect(m.sendEmail).not.toHaveBeenCalled();
  });

  it('refunds ticked items at their own rate', async () => {
    setup(two);
    const res = await executeRefundOrder({ ...ids, items: [{ lineIndex: 1, quantity: 1 }], reason: 'Cola fehlte' }, http, { now });
    expect(res.ok).toBe(true);
    expect(m.createRefund).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 350, idempotencyKey: 'refund-o1-0-350' }),
    );
    expect((m.store.current as Order).refunds![0]).toEqual(
      expect.objectContaining({
        amountCents: 350,
        lines: [{ lineIndex: 1, quantity: 1, grossCents: 350, taxRateBasisPoints: 1900 }],
      }),
    );
    expect(m.commitInvoice).toHaveBeenCalledWith(
      expect.anything(),
      'c-1',
      expect.objectContaining({
        documentType: 'correction',
        totalCents: -350,
        lines: [
          expect.objectContaining({ name: 'Cola', quantity: 1, lineTotalCents: -350, taxRateBasisPoints: 1900, taxCents: -56 }),
        ],
      }),
    );
    if (res.ok) expect(res.data.refunds[0].lines).toEqual([{ lineIndex: 1, quantity: 1 }]);
  });

  it('refuses more of an item than is left', async () => {
    setup({
      ...two,
      payment: { ...two.payment, status: 'partially_refunded' },
      refunds: [priorRefund(350, { lines: [{ lineIndex: 1, quantity: 1, grossCents: 350, taxRateBasisPoints: 1900 }] })],
    });
    const res = await executeRefundOrder({ ...ids, items: [{ lineIndex: 1, quantity: 2 }], reason: 'x' }, http, { now });
    expect(res).toEqual({ ok: false, code: 'INVALID_INPUT', error: 'Only 1 of line 2 can still be refunded' });
    expect(m.createRefund).not.toHaveBeenCalled();
  });

  it('refuses items and an amount together, or neither', async () => {
    setup(two);
    const both = await executeRefundOrder(
      { ...ids, items: [{ lineIndex: 1, quantity: 1 }], amountCents: 100, reason: 'x' },
      http,
      { now },
    );
    expect(both).toEqual({ ok: false, code: 'INVALID_INPUT', error: REFUND_MODE_ERROR });
    const neither = await executeRefundOrder({ ...ids, reason: 'x' }, http, { now });
    expect(neither).toEqual({ ok: false, code: 'INVALID_INPUT', error: REFUND_MODE_ERROR });
    expect(m.createRefund).not.toHaveBeenCalled();
  });

  it('refuses items already covered by a free-amount refund', async () => {
    setup({
      ...two,
      payment: { ...two.payment, status: 'partially_refunded' },
      refunds: [priorRefund(1400)],
    });
    const res = await executeRefundOrder({ ...ids, items: [{ lineIndex: 1, quantity: 1 }], reason: 'x' }, http, { now });
    expect(res).toEqual({ ok: false, code: 'INVALID_INPUT', error: REFUND_RATE_EXCEEDED_ERROR });
    expect(m.createRefund).not.toHaveBeenCalled();
  });
});
