import type { Order } from '../../../domain/order/Order';
import type { Shop } from '../../../domain/shop/Shop';
import { findSubscriptionsByShopId, softDeleteSubscription } from '../../../infrastructure/cosmos/push/CosmosPushSubscriptionRepository';
import { pushPublicKey, sendPushNotification } from '../../../infrastructure/push/webPush';
import { publishToShop } from '../../../infrastructure/realtime/webPubSub';
import { errorBrief } from '../../_shared/errorBrief';

/**
 * Tells the shop's open kitchen boards (Web PubSub) and installed devices (Web Push) that an order arrived.
 * Never throws: each half is guarded on its own, and neither may undo or delay-fail an order.
 */
export async function notifyShopNewOrder(order: Order, shop: Shop): Promise<void> {
  try {
    await publishToShop(shop.id, { type: 'new-order', orderId: order.id });
  } catch (err: unknown) {
    console.error('[realtime:error]', 'new-order', errorBrief(err));
  }
  try {
    if (!pushPublicKey()) return; // push is off: skip the lookup
    const subscriptions = await findSubscriptionsByShopId(shop.id);
    const payload = { type: 'new-order', orderId: order.id, orderRef: order.orderRef };
    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          const outcome = await sendPushNotification(sub, payload);
          if (outcome === 'gone') await softDeleteSubscription(shop.id, sub.endpoint);
        } catch (err: unknown) {
          console.error('[push:error]', 'new-order', errorBrief(err));
        }
      }),
    );
  } catch (err: unknown) {
    console.error('[push:error]', 'new-order', errorBrief(err));
  }
}
