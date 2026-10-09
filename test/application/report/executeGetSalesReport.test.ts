import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequest } from '@azure/functions';

vi.mock('../../../src/application/_shared/shopAccess', () => ({ authorizeShopAction: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({ findShopById: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/order/CosmosOrderRepository', () => ({ findReportRows: vi.fn() }));

import { authorizeShopAction } from '../../../src/application/_shared/shopAccess';
import { executeGetSalesReport } from '../../../src/application/report/getSalesReport/executeGetSalesReport';
import { REPORT_RANGE_ERROR, type ReportOrderRow } from '../../../src/domain/report/salesReport';
import { findReportRows } from '../../../src/infrastructure/cosmos/order/CosmosOrderRepository';
import { findShopById } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { CARD_SHOP } from '../../fixtures/orders';

const http = {} as HttpRequest;
const input = { shopId: 'shop-1', from: '2026-10-05', to: '2026-10-06' };

const cola = { productId: 'p2', productName: 'Cola', quantity: 1, unitPriceCents: 350, lineTotalCents: 350, taxRateBasisPoints: 1900, taxCents: 56 };
// accepted Mon 5 Oct 00:30 Berlin (still 4 Oct in UTC)
const O7: ReportOrderRow = {
  id: 'o7', createdAt: '2026-10-04T22:29:00.000Z', acceptedAt: '2026-10-04T22:30:00.000Z',
  fulfilmentMode: 'collection', payment: { method: 'card', status: 'paid', stripePaymentIntentId: 'pi' },
  subtotalCents: 350, totalCents: 350, items: [cola],
  taxBreakdown: [{ rateBasisPoints: 1900, grossCents: 350, taxCents: 56 }], refunds: [],
};

describe('executeGetSalesReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findShopById).mockResolvedValue(CARD_SHOP);
    vi.mocked(authorizeShopAction).mockResolvedValue({
      ok: true,
      actor: { actorType: 'owner', actorId: 'u1', role: 'owner' },
      permissions: ['view_reports'],
    } as never);
    vi.mocked(findReportRows).mockResolvedValue({ rows: [], requestCharge: 1 });
  });

  it('needs the view_reports permission', async () => {
    await executeGetSalesReport(input, http);
    expect(authorizeShopAction).toHaveBeenCalledWith(http, CARD_SHOP, 'view_reports');

    const refusal = { ok: false, code: 'FORBIDDEN', error: 'Insufficient permissions' } as const;
    vi.mocked(authorizeShopAction).mockResolvedValue(refusal as never);
    vi.mocked(findReportRows).mockClear();
    expect(await executeGetSalesReport(input, http)).toEqual(refusal);
    expect(findReportRows).not.toHaveBeenCalled();
  });

  it('refuses a bad range before reading orders', async () => {
    const res = await executeGetSalesReport({ ...input, from: '2026-10-06', to: '2026-10-05' }, http);
    expect(res).toEqual({ ok: false, code: 'INVALID_INPUT', error: REPORT_RANGE_ERROR });
    expect(findReportRows).not.toHaveBeenCalled();
  });

  it("asks for the padded window and buckets in the shop's time zone", async () => {
    vi.mocked(findReportRows).mockResolvedValue({ rows: [O7], requestCharge: 2.5 });
    const res = await executeGetSalesReport(input, http);
    expect(findReportRows).toHaveBeenCalledWith('shop-1', '2026-10-04T00:00:00.000Z', '2026-10-08T00:00:00.000Z');
    if (!res.ok) throw new Error('expected ok');
    expect(res.data.days[0]).toMatchObject({ date: '2026-10-05', orderCount: 1, grossCents: 350 });
    expect(res.data.currency).toBe('EUR');
  });

  it('an unknown restaurant is 404', async () => {
    vi.mocked(findShopById).mockResolvedValue(null);
    expect(await executeGetSalesReport(input, http)).toEqual({ ok: false, code: 'NOT_FOUND', error: 'Shop not found' });
  });
});
