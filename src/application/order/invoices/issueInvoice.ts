import type { InvoiceDoc, InvoiceDocumentType } from '../../../domain/invoice/invoice';
import {
  buildCorrection,
  buildInvoice,
  formatInvoiceNumber,
  nextSequence,
  yearKeyOf,
} from '../../../domain/invoice/invoice';
import type { Order } from '../../../domain/order/Order';
import type { Shop } from '../../../domain/shop/Shop';
import {
  commitInvoice,
  findInvoiceById,
  findInvoiceCounter,
} from '../../../infrastructure/cosmos/invoice/CosmosInvoiceRepository';
import {
  findOrderWithEtag,
  replaceOrderIfMatch,
} from '../../../infrastructure/cosmos/order/CosmosOrderRepository';

const COUNTER_ATTEMPTS = 5;
const ORDER_WRITE_ATTEMPTS = 3;

export interface OrderDocumentDto {
  id: string;
  kind: InvoiceDocumentType;
  number: string;
}

/** An accepted, money-taken card order that has no invoice number yet. */
export function needsInvoice(
  o: Pick<Order, 'state' | 'payment' | 'acceptedAt' | 'invoiceNumber'>,
): boolean {
  return (
    o.payment.method === 'card' &&
    ['paid', 'partially_refunded', 'refunded'].includes(o.payment.status) &&
    ['ACCEPTED', 'READY', 'COMPLETED'].includes(o.state) &&
    !!o.acceptedAt &&
    !o.invoiceNumber
  );
}

/**
 * Takes the next number from the restaurant's counter and stores the document with it in one step.
 * Another writer taking the counter first means we read it again; a document that already exists is returned as is.
 */
async function commitNext(
  shop: Shop,
  now: Date,
  makeDoc: (number: string) => InvoiceDoc,
): Promise<InvoiceDoc> {
  const year = yearKeyOf(now, shop.timezone);
  for (let attempt = 0; attempt < COUNTER_ATTEMPTS; attempt++) {
    const found = await findInvoiceCounter(shop.id);
    const sequence = nextSequence(found?.counter ?? null, year);
    const doc = makeDoc(formatInvoiceNumber(year, sequence));
    const result = await commitInvoice(
      {
        id: 'counter',
        shopId: shop.id,
        kind: 'counter',
        year,
        nextNumber: sequence + 1,
        updatedAt: now.toISOString(),
      },
      found?.etag ?? null,
      doc,
    );
    if (result === 'ok') return doc;
    if (result === 'invoice_exists') {
      const stored = await findInvoiceById(shop.id, doc.id);
      if (stored) return stored;
    }
    if (result === 'number_taken') {
      throw new Error(`Invoice number ${doc.number} is already used`);
    }
  }
  throw new Error('Invoice counter busy');
}

/** Writes the change to the order (only if nobody changed it meanwhile; up to 3 tries). `null` from `change` means nothing to do. */
async function recordOnOrder(
  orderId: string,
  shopId: string,
  change: (current: Order) => Order | null,
): Promise<void> {
  for (let attempt = 0; attempt < ORDER_WRITE_ATTEMPTS; attempt++) {
    const found = await findOrderWithEtag(orderId);
    if (!found || found.order.shopId !== shopId) return;
    const next = change(found.order);
    if (!next) return;
    if ((await replaceOrderIfMatch(next, found.etag)) === 'ok') return;
  }
}

export async function issueInvoiceForOrder(
  order: Order,
  shop: Shop,
  now: Date,
): Promise<InvoiceDoc> {
  const existing = await findInvoiceById(shop.id, order.id);
  const doc =
    existing ??
    (await commitNext(shop, now, (number) =>
      buildInvoice({ order, shop, number, now }),
    ));
  await recordOnOrder(order.id, shop.id, (current) =>
    current.invoiceNumber === doc.number
      ? null
      : { ...current, invoiceNumber: doc.number, updatedAt: now.toISOString() },
  );
  return doc;
}

/** The correction invoice for `order.refunds[refundIndex]`; null when the order has no invoice. */
export async function issueCorrectionForRefund(
  order: Order,
  refundIndex: number,
  shop: Shop,
  now: Date,
): Promise<InvoiceDoc | null> {
  const original = await findInvoiceById(shop.id, order.id);
  if (!original) return null;
  const refunds = order.refunds ?? [];
  const refund = refunds[refundIndex];
  const docId = `${order.id}-c${refundIndex + 1}`;
  const existing = await findInvoiceById(shop.id, docId);
  const doc =
    existing ??
    (await commitNext(shop, now, (number) =>
      buildCorrection({
        original,
        refunds: refunds.map((r) => ({ amountCents: r.amountCents, lines: r.lines })),
        index: refundIndex,
        refundId: refund.id,
        number,
        now,
      }),
    ));
  const kind = doc.documentType === 'cancellation' ? 'cancellation' : 'correction';
  await recordOnOrder(order.id, shop.id, (current) => {
    const target = (current.refunds ?? []).find((r) => r.id === refund.id);
    if (!target || (target.correctionNumber === doc.number && target.correctionKind === kind)) {
      return null;
    }
    return {
      ...current,
      refunds: (current.refunds ?? []).map((r) =>
        r.id === refund.id ? { ...r, correctionNumber: doc.number, correctionKind: kind } : r,
      ),
      updatedAt: now.toISOString(),
    };
  });
  return doc;
}

/** The invoice, then each refund's correction that has been issued. */
export function documentsOf(
  o: Pick<Order, 'id' | 'invoiceNumber' | 'refunds'>,
): OrderDocumentDto[] {
  const out: OrderDocumentDto[] = [];
  if (o.invoiceNumber) out.push({ id: o.id, kind: 'invoice', number: o.invoiceNumber });
  (o.refunds ?? []).forEach((r, i) => {
    if (r.correctionNumber) {
      out.push({
        id: `${o.id}-c${i + 1}`,
        kind: r.correctionKind ?? 'correction',
        number: r.correctionNumber,
      });
    }
  });
  return out;
}
