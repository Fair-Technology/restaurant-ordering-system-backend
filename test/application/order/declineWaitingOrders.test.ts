import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/application/_shared/auditHelpers', () => ({ logAudit: vi.fn(async () => undefined) }));
vi.mock('../../../src/infrastructure/cosmos/usage/CosmosSlotPlacesRepository', () => ({
  findSlotPlacesWithEtag: vi.fn(async () => null),
  createSlotPlaces: vi.fn(async () => 'ok'),
  replaceSlotPlacesIfMatch: vi.fn(async () => 'ok'),
}));
vi.mock('../../../src/infrastructure/cosmos/order/CosmosOrderRepository', () => ({
  findOrderWithEtag: vi.fn(),
  replaceOrderIfMatch: vi.fn(),
  findOrdersByShopIdAndStates: vi.fn(),
}));
vi.mock('../../../src/infrastructure/stripe/stripeClient', () => ({
  releaseAuthorization: vi.fn(async () => undefined),
}));
vi.mock('../../../src/infrastructure/email/emailSender', () => ({
  sendEmail: vi.fn(async () => undefined),
  emailTransportName: () => 'log',
}));

import { logAudit } from '../../../src/application/_shared/auditHelpers';
import { declineWaitingOrdersForShop } from '../../../src/application/order/_shared/declineWaitingOrders';
import {
  findOrderWithEtag,
  findOrdersByShopIdAndStates,
  replaceOrderIfMatch,
} from '../../../src/infrastructure/cosmos/order/CosmosOrderRepository';
import { CARD_SHOP, orderStore, PLACED_CARD_ORDER } from '../../fixtures/orders';

const now = new Date('2026-10-05T10:05:00Z');

describe('declineWaitingOrdersForShop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('declines each waiting order and audits it as a system decline carrying only the order ref', async () => {
    const a = { ...PLACED_CARD_ORDER, id: 'o1', orderRef: 'AAA-111' };
    const b = { ...PLACED_CARD_ORDER, id: 'o2', orderRef: 'BBB-222' };
    const stores = new Map([a, b].map((o) => [o.id, orderStore(o)]));
    (findOrdersByShopIdAndStates as any).mockResolvedValue([a, b]);
    (findOrderWithEtag as any).mockImplementation((id: string) => stores.get(id)!.findOrderWithEtag(id));
    (replaceOrderIfMatch as any).mockImplementation((o: any, etag: string) => stores.get(o.id)!.replaceOrderIfMatch(o, etag));

    expect(await declineWaitingOrdersForShop(CARD_SHOP, now)).toBe(2);

    expect(logAudit).toHaveBeenCalledTimes(2);
    for (const [id, ref] of [['o1', 'AAA-111'], ['o2', 'BBB-222']]) {
      expect(logAudit).toHaveBeenCalledWith({
        shopId: 'shop-1',
        actorType: 'system',
        actorId: 'system',
        action: 'order.decline',
        entityType: 'order',
        entityId: id,
        entityName: ref,
      });
    }
  });

  it('writes no audit entry for an order whose accept is taking the money', async () => {
    const claimed = { ...PLACED_CARD_ORDER, captureStartedAt: now.toISOString() };
    const store = orderStore(claimed);
    (findOrdersByShopIdAndStates as any).mockResolvedValue([claimed]);
    (findOrderWithEtag as any).mockImplementation(store.findOrderWithEtag);
    (replaceOrderIfMatch as any).mockImplementation(store.replaceOrderIfMatch);

    expect(await declineWaitingOrdersForShop(CARD_SHOP, now)).toBe(0);
    expect(logAudit).not.toHaveBeenCalled();
  });
});
