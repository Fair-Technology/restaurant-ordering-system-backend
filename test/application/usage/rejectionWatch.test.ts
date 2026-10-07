import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HttpRequest } from '@azure/functions';

vi.mock('../../../src/infrastructure/auth/authHelpers', () => ({ getUserIdFromAuth: vi.fn(async () => 'sa-1') }));
vi.mock('../../../src/infrastructure/cosmos/user/CosmosUserRepository', () => ({
  findUserById: vi.fn(async () => ({ systemRole: 'superadmin' })),
}));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({ findAllShops: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/order/CosmosOrderRepository', () => ({ findOrdersForRejectionStats: vi.fn() }));
vi.mock('../../../src/application/usage/orderLimitStatus', () => ({
  loadOrderLimitStatus: vi.fn(async () => ({ periodKey: '2026-10', acceptedOrderCount: 0, limit: 30, warningLevel: 0, limitReached: false })),
}));

import { findUserById } from '../../../src/infrastructure/cosmos/user/CosmosUserRepository';
import { findAllShops } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { findOrdersForRejectionStats } from '../../../src/infrastructure/cosmos/order/CosmosOrderRepository';
import { executeGetRejectionWatch } from '../../../src/application/usage/rejectionWatch/executeGetRejectionWatch';
import { CARD_SHOP } from '../../fixtures/orders';

const http = {} as HttpRequest;
const recent = new Date(Date.now() - 86_400_000).toISOString();
const accepted = { createdAt: recent, acceptedAt: recent, history: [] };
const declined = {
  createdAt: recent,
  history: [
    { from: null, to: 'PLACED', at: recent, actor: { type: 'customer' } },
    { from: 'PLACED', to: 'REJECTED', at: recent, actor: { type: 'staff', id: 's1' }, reason: 'too_busy' },
  ],
};

describe('executeGetRejectionWatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (findAllShops as any).mockResolvedValue([
      { ...CARD_SHOP, id: 'A', name: 'A Shop' },
      { ...CARD_SHOP, id: 'B', name: 'B Shop' },
    ]);
    (findOrdersForRejectionStats as any).mockImplementation(async (shopId: string) =>
      shopId === 'A' ? [accepted, accepted] : [...Array(8).fill(accepted), declined, declined],
    );
  });

  it('flagged restaurants come first', async () => {
    const res = await executeGetRejectionWatch(http);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.shops[0].shopId).toBe('B');
    expect(res.data.shops[0].rejections.flags).toEqual(['high_rate']);
  });

  it('only a superadmin may see it', async () => {
    (findUserById as any).mockResolvedValueOnce({ systemRole: 'user' });
    expect(await executeGetRejectionWatch(http)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });
});
