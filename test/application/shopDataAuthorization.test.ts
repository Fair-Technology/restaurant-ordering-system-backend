import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpRequest } from '@azure/functions';

// Only token verification and the stores are faked. The real authorisation chain
// (authenticate -> authorizeShopAction / authorizeShopRead -> permissions) runs, so
// this proves who actually reaches each endpoint: the packet-P4 authorisation gaps.
vi.mock('../../src/infrastructure/auth/authHelpers', () => ({ verifyEntraAccessToken: vi.fn() }));
vi.mock('../../src/infrastructure/auth/staffTokens', () => ({ verifyStaffToken: vi.fn() }));
vi.mock('../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({ findShopById: vi.fn() }));
vi.mock('../../src/infrastructure/cosmos/staff/CosmosStaffAccountRepository', () => ({
  findStaffAccountById: vi.fn(),
}));
vi.mock('../../src/infrastructure/cosmos/system/CosmosRolePermissionsRepository', () => ({
  getRolePermissions: vi.fn(),
}));
vi.mock('../../src/infrastructure/cosmos/product/CosmosProductRepository', () => ({
  findProductsByShopId: vi.fn(),
  findProductById: vi.fn(),
}));
vi.mock('../../src/infrastructure/cosmos/category/CosmosCategoryRepository', () => ({
  findCategoriesByShopId: vi.fn(),
  findCategoryById: vi.fn(),
}));
vi.mock('../../src/infrastructure/cosmos/order/CosmosOrderRepository', () => ({
  findOrderByStripePaymentIntentId: vi.fn(),
}));

import { verifyEntraAccessToken } from '../../src/infrastructure/auth/authHelpers';
import { verifyStaffToken } from '../../src/infrastructure/auth/staffTokens';
import { findShopById } from '../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { findStaffAccountById } from '../../src/infrastructure/cosmos/staff/CosmosStaffAccountRepository';
import { getRolePermissions } from '../../src/infrastructure/cosmos/system/CosmosRolePermissionsRepository';
import { findProductsByShopId, findProductById } from '../../src/infrastructure/cosmos/product/CosmosProductRepository';
import { findCategoriesByShopId, findCategoryById } from '../../src/infrastructure/cosmos/category/CosmosCategoryRepository';
import { findOrderByStripePaymentIntentId } from '../../src/infrastructure/cosmos/order/CosmosOrderRepository';
import { DEFAULT_ROLE_PERMISSIONS } from '../../src/domain/system/RolePermissions';
import { executeGetProductsByShop } from '../../src/application/product/getProductsByShop/executeGetProductsByShop';
import { executeGetProduct } from '../../src/application/product/getProduct/executeGetProduct';
import { executeGetCategoriesByShop } from '../../src/application/category/getCategoriesByShop/executeGetCategoriesByShop';
import { executeGetCategory } from '../../src/application/category/getCategory/executeGetCategory';
import { loadShopForOrderAction } from '../../src/application/order/intake/loadShopForOrderAction';
import { getOrderByPaymentIntent } from '../../src/application/order/getOrderByPaymentIntent/getOrderByPaymentIntent';

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const bearer = (alg: 'RS256' | 'HS256') =>
  new Headers({ authorization: `Bearer ${b64({ alg, typ: 'JWT' })}.e30.sig` });
const anonymous = { headers: new Headers() } as unknown as HttpRequest;
const entraRequest = { headers: bearer('RS256') } as unknown as HttpRequest;
const staffRequest = { headers: bearer('HS256') } as unknown as HttpRequest;

const SHOP = 'shop-1';
const shop = {
  id: SHOP,
  isDeleted: false,
  members: [{ userId: 'owner-1', role: 'owner', isActive: true }],
};

const asEntra = (userId: string, issuer: 'platform' | 'customer' = 'customer', roles: string[] = []) =>
  vi.mocked(verifyEntraAccessToken).mockResolvedValue({ oid: userId, issuer, roles } as never);
const asStaff = (shopId: string, role: 'manager' | 'staff') => {
  vi.mocked(verifyStaffToken).mockResolvedValue({ staffId: 'st-1', shopId, role } as never);
  vi.mocked(findStaffAccountById).mockResolvedValue({
    id: 'st-1', shopId, role, isActive: true, isDeleted: false,
  } as never);
};

const product = {
  id: 'p1', shopId: SHOP, name: 'Dish', description: '', price: 900, categoryIds: ['c1'],
  images: [], isAvailable: true, isDeleted: false, createdAt: 'x', updatedAt: 'x',
};
const category = { id: 'c1', shopId: SHOP, name: 'Mains', sortOrder: 1, isDeleted: false, createdAt: 'x', updatedAt: 'x' };
const order = {
  id: 'o1', shopId: SHOP, orderRef: 'R1', state: 'placed', fulfilmentMode: 'pickup',
  payment: { status: 'authorized' }, items: [], subtotalCents: 0, currency: 'eur',
  customerName: 'Someone', createdAt: 'x',
};

// One row per endpoint; `data` is the repository read that must NOT happen for a refused caller.
const endpoints = [
  {
    name: 'GET /products (back-office product list)',
    call: (req: HttpRequest) => executeGetProductsByShop({ shopId: SHOP }, req, { includeUncategorized: true }),
    data: () => findProductsByShopId,
  },
  {
    name: 'GET /products/{id}',
    call: (req: HttpRequest) => executeGetProduct({ productId: 'p1', shopId: SHOP }, req),
    data: () => findProductById,
  },
  {
    name: 'GET /shops/{id}/categories',
    call: (req: HttpRequest) => executeGetCategoriesByShop({ shopId: SHOP }, req),
    data: () => findCategoriesByShopId,
  },
  {
    name: 'GET /shops/{id}/categories/{id}',
    call: (req: HttpRequest) => executeGetCategory({ categoryId: 'c1', shopId: SHOP }, req),
    data: () => findCategoryById,
  },
];

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(findShopById).mockResolvedValue(shop as never);
  vi.mocked(getRolePermissions).mockResolvedValue(DEFAULT_ROLE_PERMISSIONS as never);
  vi.mocked(findProductsByShopId).mockResolvedValue([product] as never);
  vi.mocked(findProductById).mockResolvedValue(product as never);
  vi.mocked(findCategoriesByShopId).mockResolvedValue([category] as never);
  vi.mocked(findCategoryById).mockResolvedValue(category as never);
  vi.mocked(findOrderByStripePaymentIntentId).mockResolvedValue(order as never);
});

describe.each(endpoints)('$name', ({ call, data }) => {
  it('refuses a caller with no token, and reads nothing', async () => {
    expect(await call(anonymous)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(data()).not.toHaveBeenCalled();
  });

  it("refuses a signed-in user who is not a member of the shop (another shop's owner, or a diner)", async () => {
    asEntra('someone-else');
    expect(await call(entraRequest)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(data()).not.toHaveBeenCalled();
  });

  it("refuses another shop's staff", async () => {
    asStaff('shop-2', 'manager');
    expect(await call(staffRequest)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(data()).not.toHaveBeenCalled();
  });

  it('lets the shop owner through', async () => {
    asEntra('owner-1');
    expect((await call(entraRequest)).ok).toBe(true);
  });

  it('lets one of its own managers through', async () => {
    asStaff(SHOP, 'manager');
    expect((await call(staffRequest)).ok).toBe(true);
  });
});

describe('the menu reads that are not the back-office product list', () => {
  // The three sibling GETs only require membership: a view_orders-only staff member
  // still needs the category/product names to run the order screens.
  it.each(endpoints.slice(1))('$name stays open to the shop\'s own plain staff', async ({ call }) => {
    asStaff(SHOP, 'staff');
    expect((await call(staffRequest)).ok).toBe(true);
  });

  it.each(endpoints.slice(1))('$name stays open to a platform operator', async ({ call }) => {
    asEntra('op-1', 'platform', ['Platform.Support']);
    expect((await call(entraRequest)).ok).toBe(true);
  });
});

describe('GET /products needs manage_menu, like the writes it sits beside', () => {
  it('refuses plain staff (view_orders only)', async () => {
    asStaff(SHOP, 'staff');
    expect(
      await executeGetProductsByShop({ shopId: SHOP }, staffRequest, { includeUncategorized: true }),
    ).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(findProductsByShopId).not.toHaveBeenCalled();
  });

  it('is NOT_FOUND for an unknown or deleted shop, before reading products', async () => {
    asEntra('owner-1');
    vi.mocked(findShopById).mockResolvedValue({ ...shop, isDeleted: true } as never);
    expect(await executeGetProductsByShop({ shopId: SHOP }, entraRequest)).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    });
    expect(findProductsByShopId).not.toHaveBeenCalled();
  });
});

describe('GET /orders/by-payment-intent/{id}', () => {
  const call = (req: HttpRequest) => getOrderByPaymentIntent('pi_123', req);

  it('refuses an anonymous caller who holds a real PaymentIntent id', async () => {
    expect(await call(anonymous)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });

  it("refuses another shop's owner and staff", async () => {
    asEntra('someone-else');
    expect(await call(entraRequest)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    asStaff('shop-2', 'manager');
    expect(await call(staffRequest)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });

  it('never returns the customer name to a refused caller', async () => {
    asEntra('someone-else');
    expect(JSON.stringify(await call(entraRequest))).not.toContain('Someone');
  });

  it("returns the order to the owning shop's owner and staff", async () => {
    asEntra('owner-1');
    expect(await call(entraRequest)).toMatchObject({ ok: true, data: { customerName: 'Someone' } });
    asStaff(SHOP, 'staff');
    expect((await call(staffRequest)).ok).toBe(true);
  });

  it('is still NOT_FOUND for an unknown or malformed id, with no auth needed to learn that', async () => {
    vi.mocked(findOrderByStripePaymentIntentId).mockResolvedValue(null as never);
    expect(await call(anonymous)).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(await getOrderByPaymentIntent('nope', anonymous)).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });
});

// The six kitchen writes (accept, reject, ready, dispatch, complete, busy-mode) all start here.
// Gating them by `view_orders` is a recorded decision (docs/endpoint-authorization.md); these
// pin it, so changing it has to be done on purpose.
describe('kitchen actions are gated by view_orders (deliberate)', () => {
  it("lets the shop's plain staff role act, since view_orders is its whole default permission", async () => {
    asStaff(SHOP, 'staff');
    expect((await loadShopForOrderAction(SHOP, staffRequest)).ok).toBe(true);
  });

  it('refuses a role whose permissions have had view_orders taken away', async () => {
    asStaff(SHOP, 'staff');
    vi.mocked(getRolePermissions).mockResolvedValue({ manager: [], staff: ['manage_menu'] } as never);
    expect(await loadShopForOrderAction(SHOP, staffRequest)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });

  it("refuses another shop's staff and a signed-in non-member", async () => {
    asStaff('shop-2', 'manager');
    expect(await loadShopForOrderAction(SHOP, staffRequest)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    asEntra('someone-else');
    expect(await loadShopForOrderAction(SHOP, entraRequest)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });
});
