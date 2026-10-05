import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCorrection, buildInvoice } from '../../../src/domain/invoice/invoice';
import { DOCUMENT_NOT_FOUND_ERROR, ORDER_NOT_FOUND_ERROR } from '../../../src/domain/order/orderErrors';
import { ACCEPTED_CARD_ORDER, CARD_SHOP } from '../../fixtures/orders';

const m = vi.hoisted(() => ({
  authorizeShopAction: vi.fn(),
  findShopById: vi.fn(),
  findOrderById: vi.fn(),
  findInvoiceById: vi.fn(),
}));

vi.mock('../../../src/application/_shared/shopAccess', () => ({ authorizeShopAction: m.authorizeShopAction }));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({ findShopById: m.findShopById }));
vi.mock('../../../src/infrastructure/cosmos/order/CosmosOrderRepository', () => ({ findOrderById: m.findOrderById }));
vi.mock('../../../src/infrastructure/cosmos/invoice/CosmosInvoiceRepository', () => ({
  findInvoiceById: m.findInvoiceById,
}));

import {
  executeGetCustomerDocument,
  executeGetOrderDocument,
} from '../../../src/application/order/invoices/executeGetOrderDocument';

const order = { ...ACCEPTED_CARD_ORDER, state: 'COMPLETED' as const };
const token = order.customerAccessToken as string;
const invoice = buildInvoice({ order, shop: CARD_SHOP, number: 'R-2026-00001', now: new Date('2026-10-05T10:05:00Z') });
const correction = buildCorrection({
  original: invoice,
  refunds: [{ amountCents: 300 }],
  index: 0,
  refundId: 'r1',
  number: 'R-2026-00002',
  now: new Date('2026-10-05T12:00:00Z'),
});
const http = {} as any;

beforeEach(() => {
  vi.resetAllMocks();
  m.findOrderById.mockResolvedValue(order);
  m.findShopById.mockResolvedValue(CARD_SHOP);
  m.authorizeShopAction.mockResolvedValue({ ok: true, actor: { actorType: 'staff', actorId: 's1' }, permissions: ['view_orders'] });
  m.findInvoiceById.mockImplementation(async (_shop: string, id: string) =>
    id === 'o1' ? invoice : id === 'o1-c1' ? correction : null,
  );
});

describe('document downloads', () => {
  it('the diner downloads their invoice with the link token', async () => {
    const res = await executeGetCustomerDocument({ orderId: 'o1', documentId: 'o1', token });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.fileName).toBe('Rechnung-R-2026-00001.pdf');
      expect(res.data.contentType).toBe('application/pdf');
      expect(Buffer.from(res.data.contentBase64, 'base64').toString('latin1').startsWith('%PDF-')).toBe(true);
    }
  });

  it('the diner downloads a correction invoice', async () => {
    const res = await executeGetCustomerDocument({ orderId: 'o1', documentId: 'o1-c1', token });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.fileName).toBe('Rechnungskorrektur-R-2026-00002.pdf');
  });

  it('a wrong token gets nothing', async () => {
    const res = await executeGetCustomerDocument({ orderId: 'o1', documentId: 'o1', token: 'x'.repeat(32) });
    expect(res).toEqual({ ok: false, code: 'NOT_FOUND', error: ORDER_NOT_FOUND_ERROR });
    expect(m.findInvoiceById).not.toHaveBeenCalled();
  });

  it('a document of another order is not found', async () => {
    const res = await executeGetCustomerDocument({ orderId: 'o1', documentId: 'o2', token });
    expect(res).toEqual({ ok: false, code: 'NOT_FOUND', error: DOCUMENT_NOT_FOUND_ERROR });
    expect(m.findInvoiceById).not.toHaveBeenCalled();
    const staff = await executeGetOrderDocument({ shopId: 'shop-1', orderId: 'o1', documentId: 'o2' }, http);
    expect(staff).toEqual({ ok: false, code: 'NOT_FOUND', error: DOCUMENT_NOT_FOUND_ERROR });
    expect(m.findInvoiceById).not.toHaveBeenCalled();
  });

  it('restaurant staff download from the admin', async () => {
    const res = await executeGetOrderDocument({ shopId: 'shop-1', orderId: 'o1', documentId: 'o1-c1' }, http);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.fileName).toBe('Rechnungskorrektur-R-2026-00002.pdf');

    m.findOrderById.mockResolvedValue({ ...order, shopId: 'shop-2' });
    const other = await executeGetOrderDocument({ shopId: 'shop-1', orderId: 'o1', documentId: 'o1' }, http);
    expect(other).toEqual({ ok: false, code: 'NOT_FOUND', error: ORDER_NOT_FOUND_ERROR });
  });
});
