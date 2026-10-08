import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildInvoice } from '../../../src/domain/invoice/invoice';
import type { InvoiceDoc } from '../../../src/domain/invoice/invoice';
import { ACCEPTED_CARD_ORDER, CARD_SHOP, orderStore } from '../../fixtures/orders';

const m = vi.hoisted(() => ({
  findInvoiceById: vi.fn(),
  findInvoiceCounter: vi.fn(),
  commitInvoice: vi.fn(),
  store: null as any,
}));

vi.mock('../../../src/infrastructure/cosmos/invoice/CosmosInvoiceRepository', () => ({
  findInvoiceById: m.findInvoiceById,
  findInvoiceCounter: m.findInvoiceCounter,
  commitInvoice: m.commitInvoice,
}));
vi.mock('../../../src/infrastructure/cosmos/order/CosmosOrderRepository', () => ({
  findOrderWithEtag: (...a: unknown[]) => m.store.findOrderWithEtag(...a),
  replaceOrderIfMatch: (...a: unknown[]) => m.store.replaceOrderIfMatch(...a),
}));

import {
  issueCorrectionForRefund,
  issueInvoiceForOrder,
  needsInvoice,
} from '../../../src/application/order/invoices/issueInvoice';

const now = new Date('2026-10-05T10:05:00Z');

beforeEach(() => {
  vi.resetAllMocks();
  m.store = orderStore(ACCEPTED_CARD_ORDER);
  m.findInvoiceById.mockResolvedValue(null);
  m.findInvoiceCounter.mockResolvedValue(null);
  m.commitInvoice.mockResolvedValue('ok');
});

describe('issueInvoiceForOrder', () => {
  it('the first invoice of the year is number 1', async () => {
    const doc = await issueInvoiceForOrder(ACCEPTED_CARD_ORDER, CARD_SHOP, now);
    expect(doc.number).toBe('R-2026-00001');
    expect(m.commitInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'counter', shopId: 'shop-1', kind: 'counter', year: '2026', nextNumber: 2 }),
      null,
      expect.objectContaining({ number: 'R-2026-00001', documentType: 'invoice' }),
    );
    expect(m.store.current.invoiceNumber).toBe('R-2026-00001');
  });

  it("continues the restaurant's counter", async () => {
    m.findInvoiceCounter.mockResolvedValue({
      counter: { id: 'counter', shopId: 'shop-1', kind: 'counter', year: '2026', nextNumber: 41, updatedAt: 'x' },
      etag: 'c-1',
    });
    const doc = await issueInvoiceForOrder(ACCEPTED_CARD_ORDER, CARD_SHOP, now);
    expect(doc.number).toBe('R-2026-00041');
    expect(m.commitInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ nextNumber: 42 }),
      'c-1',
      expect.anything(),
    );
  });

  it('starts again in a new year', async () => {
    m.findInvoiceCounter.mockResolvedValue({
      counter: { id: 'counter', shopId: 'shop-1', kind: 'counter', year: '2025', nextNumber: 300, updatedAt: 'x' },
      etag: 'c-1',
    });
    const doc = await issueInvoiceForOrder(ACCEPTED_CARD_ORDER, CARD_SHOP, now);
    expect(doc.number).toBe('R-2026-00001');
    expect(m.commitInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ year: '2026', nextNumber: 2 }),
      'c-1',
      expect.anything(),
    );
  });

  it('retries when another invoice took the counter first', async () => {
    m.commitInvoice.mockResolvedValueOnce('counter_conflict').mockResolvedValueOnce('ok');
    m.findInvoiceCounter
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        counter: { id: 'counter', shopId: 'shop-1', kind: 'counter', year: '2026', nextNumber: 2, updatedAt: 'x' },
        etag: 'c-2',
      });
    const doc = await issueInvoiceForOrder(ACCEPTED_CARD_ORDER, CARD_SHOP, now);
    expect(m.commitInvoice).toHaveBeenCalledTimes(2);
    expect(doc.number).toBe('R-2026-00002');
  });

  it('issuing twice returns the same invoice', async () => {
    const existing = buildInvoice({ order: ACCEPTED_CARD_ORDER, shop: CARD_SHOP, number: 'R-2026-00007', now });
    m.findInvoiceById.mockResolvedValue(existing);
    const doc = await issueInvoiceForOrder(ACCEPTED_CARD_ORDER, CARD_SHOP, now);
    expect(doc.number).toBe('R-2026-00007');
    expect(m.commitInvoice).not.toHaveBeenCalled();
    expect(m.store.current.invoiceNumber).toBe('R-2026-00007');
  });

  it('a used number fails loudly', async () => {
    m.commitInvoice.mockResolvedValue('number_taken');
    await expect(issueInvoiceForOrder(ACCEPTED_CARD_ORDER, CARD_SHOP, now)).rejects.toThrow(
      'Invoice number R-2026-00001 is already used',
    );
  });
});

describe('issueCorrectionForRefund', () => {
  it('a refund gets a correction invoice from the same counter', async () => {
    const order = {
      ...ACCEPTED_CARD_ORDER,
      invoiceNumber: 'R-2026-00001',
      refunds: [
        { id: 'r1', amountCents: 1050, reason: 'x', at: 'x', actor: { type: 'system' }, stripeRefundId: 're_1' },
      ],
    } as typeof ACCEPTED_CARD_ORDER;
    m.store = orderStore(order);
    const original = buildInvoice({ order, shop: CARD_SHOP, number: 'R-2026-00001', now });
    m.findInvoiceById.mockImplementation(async (_s: string, id: string) =>
      id === 'o1' ? original : null,
    );
    m.findInvoiceCounter.mockResolvedValue({
      counter: { id: 'counter', shopId: 'shop-1', kind: 'counter', year: '2026', nextNumber: 2, updatedAt: 'x' },
      etag: 'c-1',
    });
    const doc = await issueCorrectionForRefund(order, 0, CARD_SHOP, now);
    expect(doc).toEqual(expect.objectContaining({ id: 'o1-c1', number: 'R-2026-00002' }));
    expect(m.commitInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ nextNumber: 3 }),
      'c-1',
      expect.objectContaining({
        id: 'o1-c1',
        number: 'R-2026-00002',
        documentType: 'cancellation',
        totalCents: -1050,
      }),
    );
    expect(m.store.current.refunds[0]).toEqual(
      expect.objectContaining({ correctionNumber: 'R-2026-00002', correctionKind: 'cancellation' }),
    );
  });

  it('no invoice, no correction', async () => {
    const order = {
      ...ACCEPTED_CARD_ORDER,
      refunds: [{ id: 'r1', amountCents: 300, reason: 'x', at: 'x', actor: { type: 'system' }, stripeRefundId: 're_1' }],
    } as typeof ACCEPTED_CARD_ORDER;
    expect(await issueCorrectionForRefund(order, 0, CARD_SHOP, now)).toBeNull();
    expect(m.commitInvoice).not.toHaveBeenCalled();
  });

describe('needsInvoice', () => {
  it('an order on its way still needs its invoice', () => {
    expect(
      needsInvoice({
        state: 'OUT_FOR_DELIVERY',
        payment: { method: 'card', status: 'paid', stripePaymentIntentId: 'pi_1' },
        acceptedAt: '2026-10-05T10:05:00.000Z',
      }),
    ).toBe(true);
  });
});
});
