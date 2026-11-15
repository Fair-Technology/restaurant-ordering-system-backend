import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Order } from '../../../src/domain/order/Order';
import type { InvoiceDoc } from '../../../src/domain/invoice/invoice';
import { ACCEPTED_CARD_ORDER, ADDRESS, DELIVERY_ADDRESS } from '../../fixtures/orders';

// One in-memory "database" for the faked order repository, so anything the sweep writes is visible
// to the assertions. Only the Cosmos repositories are faked; `runRetention` and the domain function
// are the real code.
const db = vi.hoisted(() => ({
  orders: new Map<string, { doc: any; etag: string }>(),
  invoices: new Map<string, any>(),
  etagSeq: 0,
  failReplaceFor: new Set<string>(),
}));

vi.mock('../../../src/infrastructure/cosmos/cosmosClient');
vi.mock('../../../src/infrastructure/cosmos/order/CosmosOrderRepository', () => ({
  findOrdersWithDeliveryAddressCreatedBefore: vi.fn(async (cutoffIso: string) =>
    [...db.orders.values()]
      .filter((e) => e.doc.deliveryAddress !== undefined && e.doc.createdAt <= cutoffIso)
      .map((e) => structuredClone(e.doc)),
  ),
  findOrderWithEtag: vi.fn(async (id: string) => {
    const e = db.orders.get(id);
    return e ? { order: structuredClone(e.doc), etag: e.etag } : null;
  }),
  replaceOrderIfMatch: vi.fn(async (o: any, etag: string) => {
    if (db.failReplaceFor.has(o.id)) throw Object.assign(new Error('boom'), { code: 503 });
    const e = db.orders.get(o.id);
    if (!e || e.etag !== etag) return 'conflict';
    db.orders.set(o.id, { doc: structuredClone(o), etag: `e${++db.etagSeq}` });
    return 'ok';
  }),
}));
vi.mock('../../../src/infrastructure/cosmos/invoice/CosmosInvoiceRepository', () => ({
  findInvoiceById: vi.fn(async (shopId: string, id: string) => structuredClone(db.invoices.get(`${shopId}/${id}`) ?? null)),
  commitInvoice: vi.fn(),
  findInvoiceCounter: vi.fn(),
}));

import { runRetention } from '../../../src/application/legal/retention/runRetention';
import { findOrderWithEtag } from '../../../src/infrastructure/cosmos/order/CosmosOrderRepository';
import { findInvoiceById } from '../../../src/infrastructure/cosmos/invoice/CosmosInvoiceRepository';

const DAY = 24 * 60 * 60 * 1000;
const CREATED = '2026-01-01T12:00:00.000Z';
const at = (days: number) => new Date(Date.parse(CREATED) + days * DAY);

/** A delivery order with every personal field populated, so the negative field-diff has something to fail on. */
const deliveryOrder = (id: string, shopId: string, createdAt: string): Order =>
  ({
    ...ACCEPTED_CARD_ORDER,
    id,
    shopId,
    state: 'COMPLETED',
    fulfilmentMode: 'delivery',
    deliveryAddress: DELIVERY_ADDRESS,
    customerName: 'Anna Beispiel',
    customerEmail: 'anna@example.com',
    customerPhone: '+49 30 1234',
    customerNotes: 'leave at the door',
    customerAccessToken: 'T'.repeat(32),
    customerAddress: ADDRESS,
    invoiceNumber: '2026-0007',
    createdAt,
    updatedAt: '2026-01-05T00:00:00.000Z',
  }) as Order;

const EXPIRED = deliveryOrder('o-expired', 'shop-1', CREATED);
const EXPIRED_2 = deliveryOrder('o-expired-2', 'shop-1', CREATED);
const FRESH = deliveryOrder('o-fresh', 'shop-1', at(100).toISOString());
const OTHER_SHOP = deliveryOrder('o-other', 'shop-2', CREATED);
// A collection order (no delivery address) and an already-erased order: neither is a candidate.
const COLLECTION: Order = { ...ACCEPTED_CARD_ORDER, id: 'o-collection', shopId: 'shop-1', fulfilmentMode: 'collection', createdAt: CREATED };
const ERASED: Order = {
  ...ACCEPTED_CARD_ORDER,
  id: 'o-erased',
  shopId: 'shop-1',
  state: 'COMPLETED',
  fulfilmentMode: 'delivery',
  customerName: 'Deleted customer',
  customerEmail: '',
  customerPhone: '',
  anonymisedAt: '2026-06-01T00:00:00.000Z',
  createdAt: CREATED,
};

const INVOICE = {
  id: 'inv-1',
  shopId: 'shop-1',
  kind: 'invoice',
  documentType: 'invoice',
  number: '2026-0007',
  templateVersion: 1,
  issuedAt: '2026-01-06T10:30:00.000Z',
  supplyDate: '2026-01-06T10:30:00.000Z',
  timezone: 'Europe/Berlin',
  seller: { name: 'Ma Pasta GmbH' },
  buyer: { name: 'Anna Beispiel', address: 'Musterstraße 1, 60311 Frankfurt am Main' },
  lines: [{ name: 'Carbonara', quantity: 1, unitPriceCents: 1050, taxRateBasisPoints: 700 }],
  taxBreakdown: [{ rateBasisPoints: 700, grossCents: 1050, taxCents: 69 }],
  totalCents: 1050,
  currency: 'EUR',
  payment: { method: 'card', stripePaymentIntentId: 'pi_1' },
  orderRef: 'AB3-K7P',
  fulfilmentMode: 'delivery',
  language: 'de',
  corrects: null,
  refundId: null,
} as unknown as InvoiceDoc;

function seed() {
  db.orders.clear();
  db.invoices.clear();
  db.etagSeq = 0;
  db.failReplaceFor.clear();
  let n = 0;
  for (const o of [EXPIRED, EXPIRED_2, FRESH, OTHER_SHOP, COLLECTION, ERASED]) {
    db.orders.set(o.id, { doc: structuredClone(o), etag: `seed-${++n}` });
  }
  db.invoices.set(`${INVOICE.shopId}/${INVOICE.id}`, structuredClone(INVOICE));
}

const doc = (id: string) => db.orders.get(id)!.doc;
const snapshot = () => structuredClone(Object.fromEntries([...db.orders].map(([k, v]) => [k, v.doc])));

let logSpy: ReturnType<typeof vi.spyOn>;
const actionLines = () =>
  logSpy.mock.calls.map((c: unknown[]) => String(c[0])).filter((l: string) => l.startsWith('[retention] action='));

beforeEach(() => {
  seed();
  vi.clearAllMocks();
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('runRetention', () => {
  it('AC4: blanks an address past its window and leaves a fresh one untouched', async () => {
    const before = snapshot();
    const result = await runRetention({ now: at(200) });

    expect(result.blanked).toBe(3); // o-expired, o-expired-2, o-other
    expect(result.failures).toBe(0);
    expect(result.retentionDays).toBe(180);

    expect(doc('o-expired').deliveryAddress).toBeUndefined();
    expect(doc('o-expired-2').deliveryAddress).toBeUndefined();
    expect(doc('o-other').deliveryAddress).toBeUndefined();
    // Fresh, collection and already-erased rows: byte-identical.
    expect(doc('o-fresh')).toEqual(before['o-fresh']);
    expect(doc('o-collection')).toEqual(before['o-collection']);
    expect(doc('o-erased')).toEqual(before['o-erased']);
  });

  it('AC4 boundary: at 179 days nothing is due, at 180 the window has passed', async () => {
    await runRetention({ now: at(179) });
    expect(doc('o-expired').deliveryAddress).toEqual(DELIVERY_ADDRESS);

    const result = await runRetention({ now: at(180) });
    expect(result.blanked).toBeGreaterThan(0);
    expect(doc('o-expired').deliveryAddress).toBeUndefined();
  });

  it('AC5 negative field-diff: only deliveryAddress changes; the billing address and every personal field survive', async () => {
    const before = structuredClone(doc('o-expired'));

    await runRetention({ now: at(200) });

    const after = doc('o-expired');
    // Blanked...
    expect(after.deliveryAddress).toBeUndefined();
    expect('deliveryAddress' in after).toBe(false);
    // ...and every other field byte-identical, explicitly including the protected billing address.
    expect(after.customerName).toBe(before.customerName);
    expect(after.customerEmail).toBe(before.customerEmail);
    expect(after.customerPhone).toBe(before.customerPhone);
    expect(after.customerNotes).toBe(before.customerNotes);
    expect(after.customerAccessToken).toBe(before.customerAccessToken);
    expect(after.customerAddress).toEqual(before.customerAddress);

    // The full diff: same key set (minus the removed field) and equal values on every remaining key.
    const beforeKeys = Object.keys(before).filter((k) => k !== 'deliveryAddress');
    expect(Object.keys(after).sort()).toEqual([...beforeKeys].sort());
    for (const key of beforeKeys) expect(after[key]).toEqual(before[key]);
    // This is the assertion that would fail if the sweep had reused `anonymiseOrder`.
    expect(after.customerName).not.toBe('Deleted customer');
    expect(after.customerEmail).toBe('anna@example.com');
  });

  it('AC6: anonymisedAt is unset after a blank, asserted on its own', async () => {
    await runRetention({ now: at(200) });
    expect(doc('o-expired').anonymisedAt).toBeUndefined();
    expect('anonymisedAt' in doc('o-expired')).toBe(false);
  });

  it('AC7: is idempotent — a second run changes nothing further and blanks nothing', async () => {
    await runRetention({ now: at(200) });
    const afterFirst = snapshot();
    logSpy.mockClear();

    const second = await runRetention({ now: at(201) });

    expect(second.blanked).toBe(0);
    expect(snapshot()).toEqual(afterFirst);
    expect(actionLines()).toEqual([]);
  });

  it('AC8: does not override an erasure a person already performed', async () => {
    // A row erased before the sweep ran is not a candidate at all (no delivery address).
    const result = await runRetention({ now: at(200) });
    expect(result.blanked).toBe(3);
    expect(doc('o-erased')).toEqual(ERASED);
    expect(doc('o-erased').anonymisedAt).toBe('2026-06-01T00:00:00.000Z');
  });

  it('AC8 race: a row erased between the query and the write is left alone, never resurrected', async () => {
    vi.mocked(findOrderWithEtag).mockResolvedValueOnce({
      order: structuredClone({ ...EXPIRED, deliveryAddress: undefined } as Order),
      etag: 'seed-1',
    });
    const result = await runRetention({ now: at(200) });
    // o-expired's re-read showed it already erased: nothing written back for it.
    expect(result.blanked).toBe(2);
    expect(doc('o-expired').deliveryAddress).toEqual(DELIVERY_ADDRESS);
  });

  it('AC9: never alters the invoice snapshot — read by id before and after, field-identical', async () => {
    const before = await findInvoiceById('shop-1', 'inv-1');
    expect(before).not.toBeNull();

    await runRetention({ now: at(200) });

    const after = await findInvoiceById('shop-1', 'inv-1');
    expect(after).toEqual(before);
    expect(after).toEqual(INVOICE);
    expect(after?.buyer).toEqual(INVOICE.buyer);
    expect(after?.lines).toEqual(INVOICE.lines);
    expect(after?.totalCents).toBe(INVOICE.totalCents);
    expect(after?.issuedAt).toBe(INVOICE.issuedAt);
  });

  it('scopes to the given shops (the injected-clock route) and writes one log line per blanked row', async () => {
    const result = await runRetention({ now: at(200), onlyShopIds: ['shop-2'] });
    expect(result.blanked).toBe(1);
    expect(doc('o-other').deliveryAddress).toBeUndefined();
    expect(doc('o-expired').deliveryAddress).toEqual(DELIVERY_ADDRESS);

    const lines = actionLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('action=deliveryAddress.blank shopId=shop-2 orderId=o-other');
    // No personal data in the log line.
    expect(lines.join('\n')).not.toMatch(/Anna|@example\.com|Teststraße/);
  });

  it('a failing row does not stop the rest, and is retried next run', async () => {
    db.failReplaceFor.add('o-expired');
    const first = await runRetention({ now: at(200) });
    expect(first.failures).toBe(1);
    expect(first.blanked).toBe(2);
    expect(doc('o-expired').deliveryAddress).toEqual(DELIVERY_ADDRESS); // still here, retried tomorrow

    db.failReplaceFor.clear();
    const second = await runRetention({ now: at(201) });
    expect(second.blanked).toBe(1);
    expect(doc('o-expired').deliveryAddress).toBeUndefined();
  });
});
