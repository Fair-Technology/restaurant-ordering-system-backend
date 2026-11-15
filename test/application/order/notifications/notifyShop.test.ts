import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../src/infrastructure/realtime/webPubSub', () => ({ publishToShop: vi.fn() }));
vi.mock('../../../../src/infrastructure/push/webPush', () => ({ pushPublicKey: vi.fn(), sendPushNotification: vi.fn() }));
vi.mock('../../../../src/infrastructure/cosmos/push/CosmosPushSubscriptionRepository', () => ({
  findSubscriptionsByShopId: vi.fn(),
  softDeleteSubscription: vi.fn(),
}));

import { notifyShopNewOrder } from '../../../../src/application/order/notifications/notifyShop';
import { findSubscriptionsByShopId, softDeleteSubscription } from '../../../../src/infrastructure/cosmos/push/CosmosPushSubscriptionRepository';
import { pushPublicKey, sendPushNotification } from '../../../../src/infrastructure/push/webPush';
import { publishToShop } from '../../../../src/infrastructure/realtime/webPubSub';

const order = { id: 'o1', orderRef: 'AB3-K7P' } as any;
const shop = { id: 'shop-1' } as any;
const subs = [
  { endpoint: 'https://p/1', keys: { p256dh: 'p', auth: 'a' } },
  { endpoint: 'https://p/2', keys: { p256dh: 'p', auth: 'a' } },
];

describe('notifyShopNewOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    (pushPublicKey as any).mockReturnValue('pub');
    (findSubscriptionsByShopId as any).mockResolvedValue(subs);
    (sendPushNotification as any).mockResolvedValue('sent');
  });

  it('publishes the signal and pushes to every subscription; gone ones are soft-deleted', async () => {
    (sendPushNotification as any).mockResolvedValueOnce('sent').mockResolvedValueOnce('gone');
    await notifyShopNewOrder(order, shop);
    expect(publishToShop).toHaveBeenCalledWith('shop-1', { type: 'new-order', orderId: 'o1' });
    expect(sendPushNotification).toHaveBeenCalledTimes(2);
    expect(sendPushNotification).toHaveBeenCalledWith(subs[0], { type: 'new-order', orderId: 'o1', orderRef: 'AB3-K7P' });
    expect(softDeleteSubscription).toHaveBeenCalledOnce();
    expect(softDeleteSubscription).toHaveBeenCalledWith('shop-1', 'https://p/2');
  });

  it('a failing push half does not stop the publish half, and nothing throws', async () => {
    (findSubscriptionsByShopId as any).mockRejectedValue(new Error('cosmos down'));
    await expect(notifyShopNewOrder(order, shop)).resolves.toBeUndefined();
    expect(publishToShop).toHaveBeenCalledOnce();
  });

  it('a throwing publish half does not stop the push half', async () => {
    (publishToShop as any).mockRejectedValue(new Error('wps down'));
    await expect(notifyShopNewOrder(order, shop)).resolves.toBeUndefined();
    expect(sendPushNotification).toHaveBeenCalledTimes(2);
  });

  it('push unconfigured: no subscription lookup', async () => {
    (pushPublicKey as any).mockReturnValue(null);
    await notifyShopNewOrder(order, shop);
    expect(findSubscriptionsByShopId).not.toHaveBeenCalled();
  });
});
