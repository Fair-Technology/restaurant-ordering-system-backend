import { deleteCheckoutSession } from '../../../infrastructure/cosmos/order/CosmosCheckoutSessionRepository';
import { findOrderByStripePaymentIntentId } from '../../../infrastructure/cosmos/order/CosmosOrderRepository';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { applyTransition } from '../../../domain/order/orderLifecycle';
import { hasFreshCaptureClaim } from '../../../domain/order/payment';
import { notifyCustomer } from '../notifications/notifyOrder';
import { releaseClosedOrderPayment } from '../_shared/releasePayment';
import { transitionOrder } from '../_shared/transitionOrder';

export type PaymentIntentUpdateOutcome = 'session_removed' | 'declined' | 'release_recorded' | 'ignored';

/**
 * Stripe cancelled a payment: either we released it ourselves, or it ran out (reservations last 7 days)
 * or was cancelled in the restaurant's Stripe dashboard. A waiting order whose reservation is gone is
 * declined; a closed order gets its release recorded; a payment nobody ordered with loses its checkout.
 */
export async function executePaymentIntentUpdates(input: {
  sessionId?: string;
  paymentIntentId: string;
  now?: Date;
}): Promise<PaymentIntentUpdateOutcome> {
  const now = input.now ?? new Date();
  const order = await findOrderByStripePaymentIntentId(input.paymentIntentId);
  if (!order) {
    if (!input.sessionId) return 'ignored';
    await deleteCheckoutSession(input.sessionId);
    return 'session_removed';
  }
  const shop = await findShopById(order.shopId);
  if (!shop) throw new Error(`Shop ${order.shopId} not found for order ${order.id}`);

  if (order.state === 'PLACED' && order.payment.status === 'authorized') {
    if (hasFreshCaptureClaim(order, now)) return 'ignored'; // an accept is taking the money right now
    const declined = await transitionOrder({
      orderId: order.id,
      shopId: shop.id,
      change: (current) =>
        applyTransition(current, 'REJECTED', { now, actor: { type: 'system' }, reason: 'payment_failed' }),
    });
    if (!declined.ok) return 'ignored';
    const released = await releaseClosedOrderPayment(order.id, shop, now);
    await notifyCustomer('order_rejected', released.order ?? declined.order, shop);
    return 'declined';
  }
  if ((order.state === 'REJECTED' || order.state === 'CANCELLED') && order.payment.status === 'authorized') {
    await releaseClosedOrderPayment(order.id, shop, now);
    return 'release_recorded';
  }
  return 'ignored';
}
