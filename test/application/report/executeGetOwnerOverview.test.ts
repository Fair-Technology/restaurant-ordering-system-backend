import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequest } from '@azure/functions';

vi.mock('../../../src/infrastructure/auth/principal', () => ({ authenticate: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({
  findOwnedShopIds: vi.fn(),
  findShopById: vi.fn(),
}));
vi.mock('../../../src/infrastructure/cosmos/order/CosmosOrderRepository', () => ({
  findReportRows: vi.fn(),
  countWaitingOrders: vi.fn(),
}));
vi.mock('../../../src/application/usage/orderLimitStatus', () => ({ loadOrderLimitStatus: vi.fn() }));

import { loadOrderLimitStatus } from '../../../src/application/usage/orderLimitStatus';
import {
  executeGetOwnerOverview,
  OVERVIEW_OWNERS_ONLY_ERROR,
} from '../../../src/application/report/getOwnerOverview/executeGetOwnerOverview';
import type { ReportOrderRow } from '../../../src/domain/report/salesReport';
import { authenticate } from '../../../src/infrastructure/auth/principal';
import { countWaitingOrders, findReportRows } from '../../../src/infrastructure/cosmos/order/CosmosOrderRepository';
import { findOwnedShopIds, findShopById } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { CARD_SHOP } from '../../fixtures/orders';

const http = {} as HttpRequest;
const now = new Date('2026-10-05T10:00:00Z');
const BISTRO = { ...CARD_SHOP, id: 'shop-2', name: 'Bistro', slug: 'bistro' };
const carbonara = { productId: 'p1', productName: 'Carbonara', quantity: 1, unitPriceCents: 1050, lineTotalCents: 1050, taxRateBasisPoints: 700, taxCents: 69 };
const TODAY_ROW: ReportOrderRow = {
  id: 'o1', createdAt: '2026-10-05T09:58:00.000Z', acceptedAt: '2026-10-05T10:00:00.000Z',
  fulfilmentMode: 'collection', payment: { method: 'card', status: 'paid', stripePaymentIntentId: 'pi' },
  subtotalCents: 1050, totalCents: 1050, items: [carbonara],
  taxBreakdown: [{ rateBasisPoints: 700, grossCents: 1050, taxCents: 69 }], refunds: [],
};

async function overview() {
  const res = await executeGetOwnerOverview(http, { now });
  if (!res.ok) throw new Error(`expected ok, got ${res.error}`);
  return res.data;
}

describe('executeGetOwnerOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authenticate).mockResolvedValue({ kind: 'entra', userId: 'u1' } as never);
    vi.mocked(findOwnedShopIds).mockResolvedValue(['shop-1', 'shop-2']);
    vi.mocked(findShopById).mockImplementation(async (id: string) => (id === 'shop-1' ? CARD_SHOP : { ...BISTRO }));
    vi.mocked(findReportRows).mockImplementation(async (id: string) => ({
      rows: id === 'shop-1' ? [TODAY_ROW] : [],
      requestCharge: 1,
    }));
    vi.mocked(countWaitingOrders).mockImplementation(async (id: string) => (id === 'shop-1' ? 2 : 0));
    vi.mocked(loadOrderLimitStatus).mockImplementation(async (shop) =>
      shop.id === 'shop-1'
        ? { periodKey: '2026-10', acceptedOrderCount: 12, limit: 30, warningLevel: 0, limitReached: false }
        : { periodKey: '2026-10', acceptedOrderCount: 3, limit: null, warningLevel: 0, limitReached: false },
    );
  });

  it('one card per owned restaurant, sorted by name, limits never summed', async () => {
    const data = await overview();
    expect(data.shops.map((s) => s.name)).toEqual(['Bistro', 'Ma Pasta']);
    expect(data.shops[1]).toMatchObject({
      today: { date: '2026-10-05', orderCount: 1, takingsCents: 1050 },
      waitingCount: 2,
      orderLimit: { acceptedOrderCount: 12, limit: 30 },
    });
    expect(data.shops[0].orderLimit.limit).toBeNull();
    expect(data.combinedToday).toEqual({ currency: 'EUR', orderCount: 1, takingsCents: 1050 });
    expect(Object.keys(data).sort()).toEqual(['combinedToday', 'generatedAt', 'shops', 'truncated']);
  });

  it("asks for each restaurant's own local today", async () => {
    await overview();
    expect(findReportRows).toHaveBeenCalledWith('shop-1', '2026-10-04T00:00:00.000Z', '2026-10-07T00:00:00.000Z');
  });

  it('a staff login gets no overview', async () => {
    vi.mocked(authenticate).mockResolvedValue({ kind: 'staff', staffId: 's1', shopId: 'shop-1', role: 'manager' } as never);
    expect(await executeGetOwnerOverview(http, { now })).toEqual({
      ok: false,
      code: 'FORBIDDEN',
      error: OVERVIEW_OWNERS_ONLY_ERROR,
    });
    expect(findOwnedShopIds).not.toHaveBeenCalled();
  });

  it('different currencies give no combined total', async () => {
    vi.mocked(findShopById).mockImplementation(async (id: string) =>
      id === 'shop-1' ? CARD_SHOP : { ...BISTRO, currency: 'CHF' },
    );
    expect((await overview()).combinedToday).toBeNull();
  });

  it('a deleted restaurant is skipped', async () => {
    vi.mocked(findShopById).mockImplementation(async (id: string) =>
      id === 'shop-1' ? CARD_SHOP : { ...BISTRO, isDeleted: true },
    );
    expect((await overview()).shops).toHaveLength(1);
  });

  it('more than 25 restaurants are cut at 25', async () => {
    const ids = Array.from({ length: 26 }, (_, i) => `s${String(i).padStart(2, '0')}`);
    vi.mocked(findOwnedShopIds).mockResolvedValue(ids);
    vi.mocked(findShopById).mockImplementation(async (id: string) => ({ ...CARD_SHOP, id, name: id }));
    const data = await overview();
    expect(data.shops).toHaveLength(25);
    expect(data.truncated).toBe(true);
  });
});
