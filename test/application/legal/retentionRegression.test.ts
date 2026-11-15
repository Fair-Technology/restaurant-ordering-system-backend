import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Order } from '../../../src/domain/order/Order';
import { ACCEPTED_CARD_ORDER, ADDRESS, DELIVERY_ADDRESS } from '../../fixtures/orders';

// The sequential regression suite the card owns. It walks ONE order through three GDPR-relevant
// steps that read the same state, so it cannot be split across cards:
//
//   1. the retention sweep blanks the delivery address — and must leave `anonymisedAt` UNSET,
//      because that flag is the skip-guard for both erasure and the shop export;
//   2. the shop export (before any erasure) must still list the customer — proving the sweep did not
//      make the row look erased (a blank seed email would make this half vacuous via the
//      `o.anonymisedAt || email === ''` guard in deriveCustomers);
//   3. a real customer erasure still erases name/email/phone — and only then does the export stop
//      listing the customer.
//
// Everything below the Cosmos repositories is the REAL code: runRetention, executeEraseCustomer and
// executeExportShopData all run against one in-memory store.

const db = vi.hoisted(() => ({
  orders: new Map<string, { doc: any; etag: string }>(),
  etagSeq: 0,
}));

vi.mock('../../../src/infrastructure/cosmos/cosmosClient');
vi.mock('../../../src/application/_shared/shopAccess', () => ({
  authorizeShopAction: vi.fn(async () => ({
    ok: true,
    actor: { actorType: 'owner', actorId: 'u1', role: 'owner' },
    permissions: [],
  })),
  toAuditActor: (a: any) => ({ actorType: a.actorType, actorId: a.actorId }),
}));
vi.mock('../../../src/application/_shared/auditHelpers', () => ({ logAudit: vi.fn(async () => {}) }));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({
  findShopById: vi.fn(async () => ({
    id: 'shop-1', slug: 'mapasta', name: 'Ma Pasta', countryCode: 'DE', currency: 'EUR',
    timezone: 'Europe/Berlin', address: {}, openingHours: {}, isDeleted: false, members: [],
  })),
}));
vi.mock('../../../src/infrastructure/cosmos/category/CosmosCategoryRepository', () => ({
  findCategoriesByShopId: vi.fn(async () => []),
}));
vi.mock('../../../src/infrastructure/cosmos/product/CosmosProductRepository', () => ({
  findProductsByShopId: vi.fn(async () => []),
}));
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
    const e = db.orders.get(o.id);
    if (!e || e.etag !== etag) return 'conflict';
    db.orders.set(o.id, { doc: structuredClone(o), etag: `e${++db.etagSeq}` });
    return 'ok';
  }),
  findOrdersByShopId: vi.fn(async (shopId: string) =>
    [...db.orders.values()].filter((e) => e.doc.shopId === shopId).map((e) => structuredClone(e.doc)),
  ),
  findOrdersByShopIdAndCustomerEmail: vi.fn(async (shopId: string, emailLower: string) =>
    [...db.orders.values()]
      .filter((e) => e.doc.shopId === shopId && (e.doc.customerEmail ?? '').toLowerCase() === emailLower && !e.doc.anonymisedAt)
      .map((e) => structuredClone(e.doc)),
  ),
  replaceOrder: vi.fn(async (o: any) => {
    db.orders.set(o.id, { doc: structuredClone(o), etag: `e${++db.etagSeq}` });
    return o;
  }),
}));

import { runRetention } from '../../../src/application/legal/retention/runRetention';
import { executeEraseCustomer } from '../../../src/application/legal/eraseCustomer/executeEraseCustomer';
import { executeExportShopData } from '../../../src/application/legal/exportShopData/executeExportShopData';

const DAY = 24 * 60 * 60 * 1000;
const CREATED = '2026-01-01T12:00:00.000Z';
const at = (days: number) => new Date(Date.parse(CREATED) + days * DAY);

const SEQUENCE_ORDER: Order = {
  ...ACCEPTED_CARD_ORDER,
  id: 'o-seq',
  shopId: 'shop-1',
  state: 'COMPLETED',
  fulfilmentMode: 'delivery',
  deliveryAddress: DELIVERY_ADDRESS,
  customerName: 'Anna Beispiel',
  customerEmail: 'anna@example.com', // non-empty on purpose
  customerPhone: '+49 30 1234',
  customerAddress: ADDRESS,
  createdAt: CREATED,
} as Order;

const exportCustomers = async () => {
  const r: any = await executeExportShopData({ shopId: 'shop-1' }, {} as any);
  expect(r.ok).toBe(true);
  return r.data.customers as Array<{ email: string }>;
};

beforeEach(() => {
  db.orders.clear();
  db.etagSeq = 0;
  db.orders.set(SEQUENCE_ORDER.id, { doc: structuredClone(SEQUENCE_ORDER), etag: 'seed-1' });
});
afterEach(() => vi.restoreAllMocks());

describe('retention → erasure → export, on one order', () => {
  it('blank leaves anonymisedAt unset, the export still lists the customer, and only erasure erases them', async () => {
    // 1. The retention sweep blanks the delivery address.
    const result = await runRetention({ now: at(200) });
    expect(result.blanked).toBe(1);
    const blanked = db.orders.get('o-seq')!.doc;
    expect(blanked.deliveryAddress).toBeUndefined();
    // The whole point: the sweep must NOT set the erasure/export skip-guard.
    expect(blanked.anonymisedAt).toBeUndefined();
    expect('anonymisedAt' in blanked).toBe(false);
    // The customer's personal fields are intact — the sweep is delivery-address-only.
    expect(blanked.customerName).toBe('Anna Beispiel');
    expect(blanked.customerEmail).toBe('anna@example.com');

    // 2. The shop export, before any erasure, still lists the customer.
    expect((await exportCustomers()).map((c) => c.email)).toContain('anna@example.com');

    // 3. A real customer erasure erases name/email/phone.
    const erase: any = await executeEraseCustomer(
      { shopId: 'shop-1', email: 'anna@example.com', now: at(201) },
      {} as any,
    );
    expect(erase).toEqual({ ok: true, data: { anonymisedOrderCount: 1 } });
    const erased = db.orders.get('o-seq')!.doc;
    expect(erased.customerName).toBe('Deleted customer');
    expect(erased.customerEmail).toBe('');
    expect(erased.customerPhone).toBe('');
    expect(erased.anonymisedAt).toBe(at(201).toISOString());

    // 4. Only now does the export stop listing the customer (deriveCustomers skips an anonymised row).
    expect((await exportCustomers()).map((c) => c.email)).not.toContain('anna@example.com');
  });
});
