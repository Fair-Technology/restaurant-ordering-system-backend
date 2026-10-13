import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/application/_shared/shopAccess', () => ({ authorizeShopAction: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({ findShopById: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/usage/CosmosOrdersScreenRepository', () => ({
  findOrdersScreenDoc: vi.fn(),
  upsertOrdersScreenDoc: vi.fn(async () => undefined),
}));

import { authorizeShopAction } from '../../../src/application/_shared/shopAccess';
import { isOrdersScreenWatched } from '../../../src/application/order/_shared/ordersScreen';
import { executeOrdersScreenHeartbeat } from '../../../src/application/order/intake/executeOrdersScreenHeartbeat';
import { findShopById } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import {
  findOrdersScreenDoc,
  upsertOrdersScreenDoc,
} from '../../../src/infrastructure/cosmos/usage/CosmosOrdersScreenRepository';
import { CARD_SHOP } from '../../fixtures/orders';

const now = new Date('2026-10-05T10:05:00Z');
const http = {} as any;
const stored = (lastSeenAt: string) => ({ id: 'orders_screen_shop-1', kind: 'orders_screen', shopId: 'shop-1', lastSeenAt });

describe('orders screen heartbeat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authorizeShopAction as any).mockResolvedValue({
      ok: true,
      actor: { actorType: 'staff', actorId: 's1', role: 'staff' },
      permissions: ['view_orders'],
    });
    (findShopById as any).mockResolvedValue(CARD_SHOP);
    (findOrdersScreenDoc as any).mockResolvedValue(null);
  });

  it('the first heartbeat records the board as seen now', async () => {
    const res = await executeOrdersScreenHeartbeat({ shopId: 'shop-1' }, http, { now });
    expect(upsertOrdersScreenDoc).toHaveBeenCalledWith({
      id: 'orders_screen_shop-1',
      kind: 'orders_screen',
      shopId: 'shop-1',
      lastSeenAt: '2026-10-05T10:05:00.000Z',
    });
    expect(res).toEqual({ ok: true, data: { lastSeenAt: '2026-10-05T10:05:00.000Z' } });
  });

  it('a heartbeat within 30 seconds of the last one writes nothing', async () => {
    (findOrdersScreenDoc as any).mockResolvedValue(stored('2026-10-05T10:04:31.000Z'));
    const res = await executeOrdersScreenHeartbeat({ shopId: 'shop-1' }, http, { now });
    expect(upsertOrdersScreenDoc).not.toHaveBeenCalled();
    expect(res).toEqual({ ok: true, data: { lastSeenAt: '2026-10-05T10:04:31.000Z' } });
  });

  it('a heartbeat 30 seconds after the last one writes', async () => {
    (findOrdersScreenDoc as any).mockResolvedValue(stored('2026-10-05T10:04:30.000Z'));
    await executeOrdersScreenHeartbeat({ shopId: 'shop-1' }, http, { now });
    expect(upsertOrdersScreenDoc).toHaveBeenCalledWith(expect.objectContaining({ lastSeenAt: '2026-10-05T10:05:00.000Z' }));
  });

  it('a stored time from the future is overwritten', async () => {
    (findOrdersScreenDoc as any).mockResolvedValue(stored('2026-10-05T10:06:00.000Z'));
    await executeOrdersScreenHeartbeat({ shopId: 'shop-1' }, http, { now });
    expect(upsertOrdersScreenDoc).toHaveBeenCalledWith(expect.objectContaining({ lastSeenAt: '2026-10-05T10:05:00.000Z' }));
  });

  it("uses the board's permission and refuses others", async () => {
    const refusal = { ok: false, code: 'FORBIDDEN', error: 'x' };
    (authorizeShopAction as any).mockResolvedValue(refusal);
    const res = await executeOrdersScreenHeartbeat({ shopId: 'shop-1' }, http, { now });
    expect(res).toEqual(refusal);
    expect(authorizeShopAction).toHaveBeenCalledWith(http, CARD_SHOP, 'view_orders');
    expect(upsertOrdersScreenDoc).not.toHaveBeenCalled();
  });

  it('an unknown shop is not found', async () => {
    (findShopById as any).mockResolvedValue(null);
    expect(await executeOrdersScreenHeartbeat({ shopId: 'shop-1' }, http, { now })).toEqual({
      ok: false,
      code: 'NOT_FOUND',
      error: 'Shop not found',
    });
  });

  it('isOrdersScreenWatched: seen 3 minutes ago is watched, a millisecond later is not', async () => {
    (findOrdersScreenDoc as any).mockResolvedValue(stored('2026-10-05T10:02:00.000Z'));
    expect(await isOrdersScreenWatched('shop-1', new Date('2026-10-05T10:05:00.000Z'))).toBe(true);
    expect(await isOrdersScreenWatched('shop-1', new Date('2026-10-05T10:05:00.001Z'))).toBe(false);
  });

  it('isOrdersScreenWatched: a read error counts as nobody watching', async () => {
    (findOrdersScreenDoc as any).mockRejectedValue(new Error('boom'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await isOrdersScreenWatched('shop-1', now)).toBe(false);
    spy.mockRestore();
  });
});
