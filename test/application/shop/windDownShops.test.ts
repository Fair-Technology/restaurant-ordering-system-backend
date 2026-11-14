import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Shop } from '../../../src/domain/shop/Shop';
import type { Order } from '../../../src/domain/order/Order';
import type { Product } from '../../../src/domain/product/Product';
import type { Category } from '../../../src/domain/category/Category';
import type { InvoiceDoc } from '../../../src/domain/invoice/invoice';
import { CARD_SHOP, PLACED_CARD_ORDER, ACCEPTED_CARD_ORDER, P_PASTA, P_COLA, CATEGORIES, DELIVERY_ADDRESS } from '../../fixtures/orders';
import { ANONYMISED_CUSTOMER_NAME } from '../../../src/domain/legal/erasure';
import { isDueForWindDown } from '../../../src/domain/shop/windDown';

// One in-memory "database" shared by every faked repository, so anything the wind-down writes - or
// fails to write - is visible to the assertions, and the invoice is read back from the same store.
// Only the Cosmos repositories and the audit write are faked; the wind-down itself is the real code.
const db = vi.hoisted(() => ({
  shops: new Map<string, { doc: any; etag: string }>(),
  products: new Map<string, any>(), // key `${shopId}/${id}`
  categories: new Map<string, any>(),
  orders: new Map<string, any>(),
  invoices: new Map<string, any>(), // key `${shopId}/${id}`
  failReplaceFor: new Set<string>(),
}));

vi.mock('../../../src/infrastructure/cosmos/cosmosClient');
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({
  findDeletedShops: vi.fn(async () => [...db.shops.values()].filter((s) => s.doc.isDeleted).map((s) => structuredClone(s.doc))),
  findShopWithEtag: vi.fn(async (id: string) => {
    const s = db.shops.get(id);
    return s ? { shop: structuredClone(s.doc), etag: s.etag } : null;
  }),
  deleteShopIfMatch: vi.fn(async (id: string, etag: string) => {
    const s = db.shops.get(id);
    if (!s) return 'gone';
    if (s.etag !== etag) return 'conflict';
    db.shops.delete(id);
    return 'ok';
  }),
}));
vi.mock('../../../src/infrastructure/cosmos/order/CosmosOrderRepository', () => ({
  findOrdersByShopId: vi.fn(async (shopId: string) =>
    [...db.orders.values()].filter((o) => o.shopId === shopId).map((o) => structuredClone(o)),
  ),
  replaceOrder: vi.fn(async (o: any) => {
    if (db.failReplaceFor.has(o.id)) throw Object.assign(new Error('boom'), { code: 503 });
    db.orders.set(o.id, structuredClone(o));
    return o;
  }),
}));
vi.mock('../../../src/infrastructure/cosmos/product/CosmosProductRepository', () => ({
  findAllProductIdsByShopId: vi.fn(async (shopId: string) =>
    [...db.products.values()].filter((p) => p.shopId === shopId).map((p) => p.id),
  ),
  deleteProduct: vi.fn(async (id: string, shopId: string) => {
    if (!db.products.delete(`${shopId}/${id}`)) throw Object.assign(new Error('gone'), { code: 404 });
  }),
}));
vi.mock('../../../src/infrastructure/cosmos/category/CosmosCategoryRepository', () => ({
  findAllCategoryIdsByShopId: vi.fn(async (shopId: string) =>
    [...db.categories.values()].filter((c) => c.shopId === shopId).map((c) => c.id),
  ),
  deleteCategory: vi.fn(async (id: string, shopId: string) => {
    if (!db.categories.delete(`${shopId}/${id}`)) throw Object.assign(new Error('gone'), { code: 404 });
  }),
}));
vi.mock('../../../src/infrastructure/cosmos/invoice/CosmosInvoiceRepository', () => ({
  findInvoiceById: vi.fn(async (shopId: string, id: string) => structuredClone(db.invoices.get(`${shopId}/${id}`) ?? null)),
  commitInvoice: vi.fn(),
  findInvoiceCounter: vi.fn(),
}));
vi.mock('../../../src/application/_shared/auditHelpers', () => ({ logAudit: vi.fn(async () => {}) }));

import { executeWindDownShops } from '../../../src/application/shop/windDown/executeWindDownShops';
import * as invoiceRepo from '../../../src/infrastructure/cosmos/invoice/CosmosInvoiceRepository';
import { findInvoiceById } from '../../../src/infrastructure/cosmos/invoice/CosmosInvoiceRepository';
import { replaceOrder } from '../../../src/infrastructure/cosmos/order/CosmosOrderRepository';
import { logAudit } from '../../../src/application/_shared/auditHelpers';

const DAY = 24 * 60 * 60 * 1000;
const DELETED_AT = '2026-08-01T12:00:00.000Z';
const at = (days: number) => new Date(Date.parse(DELETED_AT) + days * DAY);

const LEFT_SHOP: Shop = { ...CARD_SHOP, id: 'shop-1', isDeleted: true, deletedAt: DELETED_AT, deletedBy: 'owner-1' };
// A shop deleted only 10 days before "day 91", and a live shop: neither may be touched.
const RECENT_SHOP: Shop = { ...CARD_SHOP, id: 'shop-recent', slug: 'recent', isDeleted: true, deletedAt: at(81).toISOString() };
const LIVE_SHOP: Shop = { ...CARD_SHOP, id: 'shop-live', slug: 'live', isDeleted: false };

const CLOSED_ORDER: Order = {
  ...ACCEPTED_CARD_ORDER,
  id: 'o-closed',
  state: 'COMPLETED',
  invoiceNumber: '2026-0001',
  customerNotes: 'no onions',
  fulfilmentMode: 'delivery',
  deliveryAddress: DELIVERY_ADDRESS,
};
// An order still open: a customer erasure would refuse the whole request; the wind-down must not.
const OPEN_ORDER: Order = { ...PLACED_CARD_ORDER, id: 'o-open', customerName: 'Ben', customerEmail: 'b@example.com' };
const ALREADY_ANON: Order = {
  ...ACCEPTED_CARD_ORDER,
  id: 'o-anon',
  state: 'REFUNDED',
  customerName: ANONYMISED_CUSTOMER_NAME,
  customerEmail: '',
  customerPhone: '',
  anonymisedAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
};
const OTHER_SHOP_ORDER: Order = { ...PLACED_CARD_ORDER, id: 'o-other', shopId: 'shop-recent' };

const SOFT_DELETED_PRODUCT: Product = { ...P_COLA, id: 'p-old', isDeleted: true };
const OTHER_SHOP_PRODUCT: Product = { ...P_PASTA, id: 'p-recent', shopId: 'shop-recent' };
const OTHER_SHOP_CATEGORY: Category = { ...CATEGORIES[0], id: 'c-recent', shopId: 'shop-recent' };

const INVOICE: InvoiceDoc = {
  id: 'inv-1',
  shopId: 'shop-1',
  kind: 'invoice',
  documentType: 'invoice',
  number: '2026-0001',
  templateVersion: 1,
  issuedAt: '2026-07-10T10:30:00.000Z',
  supplyDate: '2026-07-10T10:30:00.000Z',
  timezone: 'Europe/Berlin',
  seller: { name: 'Ma Pasta GmbH' },
  buyer: { name: 'Anna', address: 'Teststraße 1, 10115 Berlin' },
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
  db.shops.clear();
  db.products.clear();
  db.categories.clear();
  db.orders.clear();
  db.invoices.clear();
  db.failReplaceFor.clear();
  for (const s of [LEFT_SHOP, RECENT_SHOP, LIVE_SHOP]) db.shops.set(s.id, { doc: structuredClone(s), etag: `"e-${s.id}"` });
  for (const p of [P_PASTA, P_COLA, SOFT_DELETED_PRODUCT, OTHER_SHOP_PRODUCT]) db.products.set(`${p.shopId}/${p.id}`, structuredClone(p));
  for (const c of [...CATEGORIES, OTHER_SHOP_CATEGORY]) db.categories.set(`${c.shopId}/${c.id}`, structuredClone(c));
  for (const o of [CLOSED_ORDER, OPEN_ORDER, ALREADY_ANON, OTHER_SHOP_ORDER]) db.orders.set(o.id, structuredClone(o));
  db.invoices.set(`${INVOICE.shopId}/${INVOICE.id}`, structuredClone(INVOICE));
}

const snapshot = () => structuredClone({
  shops: Object.fromEntries([...db.shops].map(([k, v]) => [k, v.doc])),
  products: Object.fromEntries(db.products),
  categories: Object.fromEntries(db.categories),
  orders: Object.fromEntries(db.orders),
  invoices: Object.fromEntries(db.invoices),
});

let logSpy: ReturnType<typeof vi.spyOn>;
const actionLines = () =>
  logSpy.mock.calls.map((c: unknown[]) => String(c[0])).filter((l: string) => l.startsWith('[windDown] action='));

beforeEach(() => {
  seed();
  vi.clearAllMocks();
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('isDueForWindDown', () => {
  it('is due from exactly 90 days after deletedAt, and never without a readable deletedAt', () => {
    expect(isDueForWindDown(LEFT_SHOP, at(89))).toBe(false);
    expect(isDueForWindDown(LEFT_SHOP, new Date(at(90).getTime() - 1))).toBe(false);
    expect(isDueForWindDown(LEFT_SHOP, at(90))).toBe(true);
    expect(isDueForWindDown(LEFT_SHOP, at(91))).toBe(true);
    expect(isDueForWindDown({ isDeleted: true }, at(1000))).toBe(false);
    expect(isDueForWindDown({ isDeleted: true, deletedAt: 'garbage' }, at(1000))).toBe(false);
    expect(isDueForWindDown({ isDeleted: false, deletedAt: DELETED_AT }, at(1000))).toBe(false);
  });
});

describe('executeWindDownShops', () => {
  it('AC1: at day 89 deletes nothing — storefront, menu and every order intact', async () => {
    const before = snapshot();
    const result = await executeWindDownShops({ now: at(89) });

    expect(result).toEqual({ shopsWoundDown: 0, ordersAnonymised: 0, productsDeleted: 0, categoriesDeleted: 0, failures: 0 });
    expect(snapshot()).toEqual(before);
    expect(replaceOrder).not.toHaveBeenCalled();
    expect(actionLines()).toEqual([]);
  });

  it('AC2: at day 91 deletes storefront and menu and anonymises every order, open ones included', async () => {
    const result = await executeWindDownShops({ now: at(91) });

    expect(result).toEqual({ shopsWoundDown: 1, ordersAnonymised: 2, productsDeleted: 3, categoriesDeleted: 2, failures: 0 });
    // Storefront and menu: gone, soft-deleted dishes included.
    expect(db.shops.has('shop-1')).toBe(false);
    expect([...db.products.values()].filter((p) => p.shopId === 'shop-1')).toEqual([]);
    expect([...db.categories.values()].filter((c) => c.shopId === 'shop-1')).toEqual([]);

    // Orders: kept, with amounts and dishes, but no person.
    for (const id of ['o-closed', 'o-open']) {
      const o = db.orders.get(id);
      expect(o).toBeDefined();
      expect(o.customerName).toBe(ANONYMISED_CUSTOMER_NAME);
      expect(o.customerEmail).toBe('');
      expect(o.customerPhone).toBe('');
      expect(o.customerAccessToken).toBeUndefined();
      expect(o.customerNotes).toBeUndefined();
      expect(o.deliveryAddress).toBeUndefined();
      expect(o.anonymisedAt).toBe(at(91).toISOString());
      expect(o.items).toEqual(PLACED_CARD_ORDER.items);
    }
    expect(db.orders.get('o-closed').invoiceNumber).toBe('2026-0001');
    expect(db.orders.get('o-open').state).toBe('PLACED');
    // Already anonymised: not rewritten.
    expect(db.orders.get('o-anon')).toEqual(ALREADY_ANON);

    // Other shops untouched: the one deleted 81 days ago, and the live one.
    expect(db.shops.has('shop-recent')).toBe(true);
    expect(db.shops.has('shop-live')).toBe(true);
    expect(db.products.has('shop-recent/p-recent')).toBe(true);
    expect(db.categories.has('shop-recent/c-recent')).toBe(true);
    expect(db.orders.get('o-other')).toEqual(OTHER_SHOP_ORDER);

    expect(logAudit).toHaveBeenCalledTimes(1);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ shopId: 'shop-1', actorType: 'system', action: 'shop.windDown', entityId: 'shop-1' }),
    );
  });

  it('AC3: never alters the invoice snapshot — read by id before and after, field-identical', async () => {
    const before = await findInvoiceById('shop-1', 'inv-1');
    expect(before).not.toBeNull();

    await executeWindDownShops({ now: at(91) });

    const after = await findInvoiceById('shop-1', 'inv-1');
    expect(after).toEqual(before);
    expect(after).toEqual(INVOICE);
    // Still names the buyer: an issued invoice keeps its printed name for eight years (SPECS §15).
    expect(after?.buyer).toEqual(INVOICE.buyer);
    expect(invoiceRepo.commitInvoice).not.toHaveBeenCalled();
  });

  it('AC4: is idempotent — a second run changes nothing further and logs nothing', async () => {
    await executeWindDownShops({ now: at(91) });
    const afterFirst = snapshot();
    vi.mocked(replaceOrder).mockClear();
    logSpy.mockClear();

    const second = await executeWindDownShops({ now: at(91) });

    expect(second).toEqual({ shopsWoundDown: 0, ordersAnonymised: 0, productsDeleted: 0, categoriesDeleted: 0, failures: 0 });
    expect(snapshot()).toEqual(afterFirst);
    expect(replaceOrder).not.toHaveBeenCalled();
    expect(actionLines()).toEqual([]);
  });

  it('AC5: writes exactly one log line per action', async () => {
    const result = await executeWindDownShops({ now: at(91) });
    const lines = actionLines();

    const actions = result.ordersAnonymised + result.productsDeleted + result.categoriesDeleted + result.shopsWoundDown;
    expect(lines).toHaveLength(actions);
    const expected = [
      'action=order.anonymise shopId=shop-1 orderId=o-closed ',
      'action=order.anonymise shopId=shop-1 orderId=o-open ',
      'action=product.delete shopId=shop-1 productId=p1',
      'action=product.delete shopId=shop-1 productId=p2',
      'action=product.delete shopId=shop-1 productId=p-old',
      'action=category.delete shopId=shop-1 categoryId=pasta',
      'action=category.delete shopId=shop-1 categoryId=drinks',
      'action=shop.delete shopId=shop-1 ',
    ];
    for (const fragment of expected) {
      expect(lines.filter((l: string) => l.includes(fragment))).toHaveLength(1);
    }
    // No personal data in the log lines.
    expect(lines.join('\n')).not.toMatch(/Anna|Ben|@example\.com/);
  });

  it('anonymises per row: one failing order does not stop the rest, and the shop is retried next run', async () => {
    db.failReplaceFor.add('o-closed');
    const first = await executeWindDownShops({ now: at(91) });

    expect(first.failures).toBe(1);
    expect(db.orders.get('o-open').anonymisedAt).toBe(at(91).toISOString());
    expect(db.orders.get('o-closed').customerName).toBe(CLOSED_ORDER.customerName);
    // The shop document is the cursor: kept so tomorrow's run finds it again.
    expect(db.shops.has('shop-1')).toBe(true);

    db.failReplaceFor.clear();
    const second = await executeWindDownShops({ now: at(92) });
    expect(second).toEqual({ shopsWoundDown: 1, ordersAnonymised: 1, productsDeleted: 0, categoriesDeleted: 0, failures: 0 });
    expect(db.orders.get('o-closed').customerName).toBe(ANONYMISED_CUSTOMER_NAME);
    expect(db.orders.get('o-open').anonymisedAt).toBe(at(91).toISOString()); // not rewritten
    expect(db.shops.has('shop-1')).toBe(false);
  });

  it('leaves a shop that was changed (e.g. restored) since it was read', async () => {
    const { deleteShopIfMatch } = await import('../../../src/infrastructure/cosmos/shop/CosmosShopRepository');
    vi.mocked(deleteShopIfMatch).mockResolvedValueOnce('conflict');
    const result = await executeWindDownShops({ now: at(91) });
    expect(result.shopsWoundDown).toBe(0);
    expect(db.shops.has('shop-1')).toBe(true);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('honours onlyShopIds and the supplied actor (the injected-clock route)', async () => {
    const result = await executeWindDownShops({
      now: at(1000),
      onlyShopIds: ['shop-recent'],
      actor: { actorType: 'superadmin', actorId: 'admin-1' },
    });
    expect(result.shopsWoundDown).toBe(1);
    expect(db.shops.has('shop-recent')).toBe(false);
    expect(db.shops.has('shop-1')).toBe(true); // due, but not asked for
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ shopId: 'shop-recent', actorType: 'superadmin', actorId: 'admin-1' }));
  });
});
