import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpRequest } from '@azure/functions';
import { CARD_SHOP, PLACED_CARD_ORDER, P_PASTA, CATEGORIES } from '../fixtures/orders';
import { COMPLETE_IDENTITY } from '../fixtures/legal';

// Only the identity and the data are faked: `authenticate` returns a principal, and the Cosmos
// repositories return fixtures. `shopAccess`, `superAdminAuthHelpers`, `platformAccessLevel` and
// every handler/service are the REAL code, so a read in this file runs the whole route - gate,
// service, mapping - to a successful result, and a write runs to a refusal.
//
// What this does NOT prove: nothing here talks to Entra, Cosmos or Stripe. The "ReadOnly token" is
// a faked principal; token -> principal mapping is covered by platformAccess.test.ts. What each
// read returns is real handler output over faked repository data.
const principalRef = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../../src/infrastructure/auth/principal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/infrastructure/auth/principal')>()),
  authenticate: vi.fn(async () => principalRef.current),
}));
// Nothing may reach a database: an un-mocked repository would try localhost:8081. Each factory
// keeps the real module's other exports and stubs only the functions this file drives.
vi.mock('../../src/infrastructure/cosmos/cosmosClient');
vi.mock('../../src/infrastructure/cosmos/shop/CosmosShopRepository', async (io) => ({
  ...(await io<object>()),
  findShopById: vi.fn(),
}));
vi.mock('../../src/infrastructure/cosmos/order/CosmosOrderRepository', async (io) => ({
  ...(await io<object>()),
  findOrderById: vi.fn(),
  findOrderByStripePaymentIntentId: vi.fn(),
  findOrdersByShopIdAndStates: vi.fn(),
  findOrdersByShopIdPaginated: vi.fn(),
  countOrdersByShopId: vi.fn(),
  listDiscountUseRows: vi.fn(),
  findReportRows: vi.fn(),
}));
vi.mock('../../src/infrastructure/cosmos/promotion/CosmosPromotionRepository', async (io) => ({
  ...(await io<object>()),
  findPromotions: vi.fn(),
}));
vi.mock('../../src/infrastructure/cosmos/system/CosmosPlatformLegalIdentityRepository', async (io) => ({
  ...(await io<object>()),
  getPlatformLegalIdentity: vi.fn(),
}));
vi.mock('../../src/infrastructure/cosmos/system/CosmosRolePermissionsRepository', async (io) => ({
  ...(await io<object>()),
  getRolePermissions: vi.fn(),
}));
vi.mock('../../src/infrastructure/cosmos/product/CosmosProductRepository', async (io) => ({
  ...(await io<object>()),
  findProductsByShopId: vi.fn(),
  findProductById: vi.fn(),
}));
vi.mock('../../src/infrastructure/cosmos/category/CosmosCategoryRepository', async (io) => ({
  ...(await io<object>()),
  findCategoriesByShopId: vi.fn(),
  findCategoryById: vi.fn(),
}));
vi.mock('../../src/infrastructure/cosmos/staff/CosmosStaffAccountRepository', async (io) => ({
  ...(await io<object>()),
  listStaffAccounts: vi.fn(),
  findStaffAccountById: vi.fn(),
}));
vi.mock('../../src/infrastructure/cosmos/audit/CosmosAuditRepository', async (io) => ({
  ...(await io<object>()),
  findAuditEntriesByShop: vi.fn(),
}));
vi.mock('../../src/infrastructure/cosmos/user/CosmosUserRepository', async (io) => ({
  ...(await io<object>()),
  findUserById: vi.fn(),
}));
vi.mock('../../src/infrastructure/cosmos/subscription/CosmosSubscriptionRepository', async (io) => ({
  ...(await io<object>()),
  findSubscriptionByShopId: vi.fn(),
  upsertSubscription: vi.fn(),
}));
vi.mock('../../src/infrastructure/cosmos/plan/CosmosPlanRepository', async (io) => ({
  ...(await io<object>()),
  findDefaultPlan: vi.fn(),
  findPlanById: vi.fn(),
}));
vi.mock('../../src/infrastructure/cosmos/usage/CosmosUsageRepository', async (io) => ({
  ...(await io<object>()),
  findUsageByShopId: vi.fn(),
}));
vi.mock('../../src/infrastructure/cosmos/invoice/CosmosInvoiceRepository', async (io) => ({
  ...(await io<object>()),
  findInvoiceById: vi.fn(),
}));
vi.mock('../../src/infrastructure/pdf/invoicePdf', async (io) => ({
  ...(await io<object>()),
  renderInvoicePdf: vi.fn(),
}));

import { executeGetProductsByShop } from '../../src/application/product/getProductsByShop/executeGetProductsByShop';
import { executeListStaff } from '../../src/application/staff/listStaff/executeListStaff';
import { executeGetSalesReport } from '../../src/application/report/getSalesReport/executeGetSalesReport';
import { executeGetShopLegal } from '../../src/application/legal/getShopLegal/executeGetShopLegal';
import { executeGetOrdersByShop } from '../../src/application/order/getOrdersByShop/executeGetOrdersByShop';
import { executeGetAuditEntries } from '../../src/application/audit/getAuditEntries/executeGetAuditEntries';
import { executeGetCategoriesByShop } from '../../src/application/category/getCategoriesByShop/executeGetCategoriesByShop';
import { executeGetCategory } from '../../src/application/category/getCategory/executeGetCategory';
import { executeGetProduct } from '../../src/application/product/getProduct/executeGetProduct';
import { executeGetOrderLimit } from '../../src/application/usage/getOrderLimit/executeGetOrderLimit';
import { executeGetShopSubscription } from '../../src/application/subscription/getShopSubscription/executeGetShopSubscription';
import { executeGetShop } from '../../src/application/shop/getShop/executeGetShop';
import { getOrderByPaymentIntent } from '../../src/application/order/getOrderByPaymentIntent/getOrderByPaymentIntent';
import { executeGetOrderDocument } from '../../src/application/order/invoices/executeGetOrderDocument';
import { executeGetOrderQueue } from '../../src/application/order/intake/executeGetOrderQueue';
import { executeGetPromotions } from '../../src/application/promotion/getPromotions/executeGetPromotions';
import { executeGetCombos } from '../../src/application/combo/getCombos/executeGetCombos';
import { executeCreateStaff } from '../../src/application/staff/createStaff/executeCreateStaff';
import { executeCreateCombo } from '../../src/application/combo/createCombo/executeCreateCombo';
import { executeCreateDiscountCode } from '../../src/application/promotion/createDiscountCode/executeCreateDiscountCode';
import { executeAcceptOrder } from '../../src/application/order/intake/executeAcceptOrder';
import { executeCreateCategory } from '../../src/application/category/createCategory/executeCreateCategory';
import { executeUpdateShop } from '../../src/application/shop/updateShop/executeUpdateShop';
import { executeDeleteShop } from '../../src/application/shop/deleteShop/executeDeleteShop';

import { findShopById } from '../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import {
  findOrderById,
  findOrderByStripePaymentIntentId,
  findOrdersByShopIdAndStates,
  findOrdersByShopIdPaginated,
  countOrdersByShopId,
  listDiscountUseRows,
  findReportRows,
} from '../../src/infrastructure/cosmos/order/CosmosOrderRepository';
import { findPromotions } from '../../src/infrastructure/cosmos/promotion/CosmosPromotionRepository';
import { getPlatformLegalIdentity } from '../../src/infrastructure/cosmos/system/CosmosPlatformLegalIdentityRepository';
import { getRolePermissions } from '../../src/infrastructure/cosmos/system/CosmosRolePermissionsRepository';
import { findProductsByShopId, findProductById } from '../../src/infrastructure/cosmos/product/CosmosProductRepository';
import { findCategoriesByShopId, findCategoryById } from '../../src/infrastructure/cosmos/category/CosmosCategoryRepository';
import { listStaffAccounts, findStaffAccountById } from '../../src/infrastructure/cosmos/staff/CosmosStaffAccountRepository';
import { findAuditEntriesByShop } from '../../src/infrastructure/cosmos/audit/CosmosAuditRepository';
import { findUserById } from '../../src/infrastructure/cosmos/user/CosmosUserRepository';
import { findSubscriptionByShopId, upsertSubscription } from '../../src/infrastructure/cosmos/subscription/CosmosSubscriptionRepository';
import { findDefaultPlan, findPlanById } from '../../src/infrastructure/cosmos/plan/CosmosPlanRepository';
import { findUsageByShopId } from '../../src/infrastructure/cosmos/usage/CosmosUsageRepository';
import { findInvoiceById } from '../../src/infrastructure/cosmos/invoice/CosmosInvoiceRepository';
import { renderInvoicePdf } from '../../src/infrastructure/pdf/invoicePdf';

const http = {} as HttpRequest;
const S = 'shop-1';

const platform = (roles: string[]) => ({ kind: 'entra', userId: 'op-1', issuer: 'platform', roles });
const readOnly = platform(['Platform.ReadOnly']);
const support = platform(['Platform.Support']);
const strangerCustomer = { kind: 'entra', userId: 'u-x', issuer: 'customer', roles: ['Platform.ReadOnly'] };
/** CARD_SHOP's own owner (see test/fixtures/orders.ts), not a platform operator. */
const owner = { kind: 'entra', userId: 'u1', issuer: 'customer', roles: [] };

const BASIC_PLAN = {
  id: 'plan-basic',
  isDefault: true,
  limits: [
    { key: 'ORDERS_PER_MONTH', value: 30 },
    { key: 'STAFF_ACCOUNTS', value: 5 },
  ],
};

const INVOICE_DOC = {
  id: PLACED_CARD_ORDER.id,
  shopId: S,
  number: '2026-0001',
  language: 'en',
  documentType: 'invoice',
};

// Every shop-scoped read this packet covers. Each one is run end to end: a ReadOnly operator must
// get a successful result, not merely "not forbidden".
const reads: Array<[string, () => Promise<{ ok: boolean; code?: string }>]> = [
  ['getProductsByShop', () => executeGetProductsByShop({ shopId: S } as never, http)],
  ['getProduct', () => executeGetProduct({ shopId: S, productId: P_PASTA.id } as never, http)],
  ['getCategoriesByShop', () => executeGetCategoriesByShop({ shopId: S } as never, http)],
  ['getCategory', () => executeGetCategory({ shopId: S, categoryId: CATEGORIES[0].id } as never, http)],
  ['listStaff', () => executeListStaff({ shopId: S } as never, http)],
  ['getSalesReport', () => executeGetSalesReport({ shopId: S, from: '2026-11-01', to: '2026-11-10' }, http)],
  ['getShopLegal', () => executeGetShopLegal({ shopId: S }, http)],
  ['getOrdersByShop', () => executeGetOrdersByShop({ shopId: S } as never, http)],
  ['getAuditEntries', () => executeGetAuditEntries({ shopId: S } as never, http)],
  ['getOrderLimit', () => executeGetOrderLimit(S, http)],
  ['getShopSubscription', () => executeGetShopSubscription(S, http)],
  ['getOrderByPaymentIntent', () => getOrderByPaymentIntent('pi_123', http)],
  [
    'getOrderDocument',
    () =>
      executeGetOrderDocument(
        { shopId: S, orderId: PLACED_CARD_ORDER.id, documentId: PLACED_CARD_ORDER.id },
        http,
      ),
  ],
  ['getOrderQueue', () => executeGetOrderQueue({ shopId: S }, http)],
  ['getPromotions', () => executeGetPromotions({ shopId: S }, http)],
  ['getCombos', () => executeGetCombos({ shopId: S }, http)],
];

// Writes that must stay closed to ReadOnly. Asserted as FORBIDDEN exactly, so a request that
// fails validation first would fail this test rather than pass it vacuously.
const writes: Array<[string, () => Promise<{ ok: boolean; code?: string }>]> = [
  ['createStaff', () => executeCreateStaff({ shopId: S, username: 'kitchen.one', password: 'Correct-Horse-9', role: 'staff' } as never, http)],
  ['createCombo', () => executeCreateCombo({ shopId: S, body: {} }, http)],
  ['createDiscountCode', () => executeCreateDiscountCode({ shopId: S, body: {} }, http)],
  ['acceptOrder', () => executeAcceptOrder({ shopId: S, orderId: 'o1' } as never, http)],
  ['createCategory', () => executeCreateCategory({ shopId: S, name: 'C' } as never, http)],
  ['updateShop', () => executeUpdateShop({ shopId: S, name: 'N' } as never, http)],
  ['deleteShop', () => executeDeleteShop({ shopId: S } as never, http)],
];

describe('Platform.ReadOnly on shop-scoped routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findShopById).mockResolvedValue(CARD_SHOP as never);
    vi.mocked(findOrderById).mockResolvedValue(PLACED_CARD_ORDER as never);
    vi.mocked(findOrderByStripePaymentIntentId).mockResolvedValue(PLACED_CARD_ORDER as never);
    vi.mocked(findOrdersByShopIdAndStates).mockResolvedValue([] as never);
    vi.mocked(findOrdersByShopIdPaginated).mockResolvedValue([] as never);
    vi.mocked(countOrdersByShopId).mockResolvedValue(0 as never);
    vi.mocked(listDiscountUseRows).mockResolvedValue([] as never);
    vi.mocked(findReportRows).mockResolvedValue({ rows: [], requestCharge: 0 } as never);
    vi.mocked(findPromotions).mockResolvedValue(null as never);
    vi.mocked(getPlatformLegalIdentity).mockResolvedValue(COMPLETE_IDENTITY as never);
    vi.mocked(getRolePermissions).mockResolvedValue({ manager: [], staff: [] } as never);
    vi.mocked(findProductsByShopId).mockResolvedValue([P_PASTA] as never);
    vi.mocked(findProductById).mockResolvedValue(P_PASTA as never);
    vi.mocked(findCategoriesByShopId).mockResolvedValue(CATEGORIES as never);
    vi.mocked(findCategoryById).mockResolvedValue(CATEGORIES[0] as never);
    vi.mocked(listStaffAccounts).mockResolvedValue([] as never);
    vi.mocked(findStaffAccountById).mockResolvedValue(null as never);
    vi.mocked(findAuditEntriesByShop).mockResolvedValue({ entries: [], total: 0 } as never);
    vi.mocked(findUserById).mockResolvedValue(null as never);
    vi.mocked(findSubscriptionByShopId).mockResolvedValue(null as never);
    vi.mocked(upsertSubscription).mockImplementation(async (s: any) => s);
    vi.mocked(findDefaultPlan).mockResolvedValue(BASIC_PLAN as never);
    vi.mocked(findPlanById).mockResolvedValue(BASIC_PLAN as never);
    vi.mocked(findUsageByShopId).mockResolvedValue(null as never);
    vi.mocked(findInvoiceById).mockResolvedValue(INVOICE_DOC as never);
    vi.mocked(renderInvoicePdf).mockResolvedValue(new Uint8Array([1, 2, 3]) as never);
    principalRef.current = readOnly;
  });

  it.each(reads)('read %s: a ReadOnly operator gets a successful result', async (_n, call) => {
    const res = await call();
    expect(res).toMatchObject({ ok: true });
  });

  it.each(reads)('read %s: a customer-tenant token carrying the role is still refused', async (_n, call) => {
    principalRef.current = strangerCustomer;
    const res = await call();
    expect(res.ok).toBe(false);
    expect(res.code).toBe('FORBIDDEN');
  });

  it.each(writes)('write %s: a ReadOnly operator is refused', async (_n, call) => {
    const res = await call();
    expect(res.ok).toBe(false);
    expect(res.code).toBe('FORBIDDEN');
  });

  it('getShop (public view): ReadOnly gets the operator view, a customer-tenant token does not', async () => {
    const asReadOnly = await executeGetShop({ shopId: S } as never, http);
    expect(asReadOnly.ok && asReadOnly.data.callerRole).toBe('superadmin');
    principalRef.current = strangerCustomer;
    const asStranger = await executeGetShop({ shopId: S } as never, http);
    expect(asStranger.ok && asStranger.data.callerRole).toBeNull();
  });

  it('Platform.Support (write level) still reads', async () => {
    principalRef.current = support;
    expect((await executeGetOrderQueue({ shopId: S }, http)).ok).toBe(true);
  });

  // The GET is on the ReadOnly list, but its read path lazily creates a shop_subscriptions
  // document for shops that pre-date billing. Creating it is a write, so a platform operator's
  // read must return the derived default without persisting it.
  describe('getShopSubscription: the lazy init must never run for a platform operator', () => {
    it('ReadOnly reads the derived default and writes nothing', async () => {
      vi.mocked(findSubscriptionByShopId).mockResolvedValue(null as never);
      const res = await executeGetShopSubscription(S, http);
      expect(upsertSubscription).not.toHaveBeenCalled();
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.subscription.planId).toBe('plan-basic');
        expect(res.data.entitlements.planId).toBe('plan-basic');
      }
    });

    it('Platform.Support reads the derived default and writes nothing either', async () => {
      principalRef.current = support;
      vi.mocked(findSubscriptionByShopId).mockResolvedValue(null as never);
      const res = await executeGetShopSubscription(S, http);
      expect(upsertSubscription).not.toHaveBeenCalled();
      expect(res.ok).toBe(true);
    });

    it("the shop's own owner still initialises a missing subscription", async () => {
      principalRef.current = owner;
      vi.mocked(findSubscriptionByShopId).mockResolvedValue(null as never);
      const res = await executeGetShopSubscription(S, http);
      expect(upsertSubscription).toHaveBeenCalledTimes(1);
      expect(upsertSubscription).toHaveBeenCalledWith(expect.objectContaining({ shopId: S, planId: 'plan-basic' }));
      expect(res.ok).toBe(true);
    });
  });
});
