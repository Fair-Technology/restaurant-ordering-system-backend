import { autoAcceptsOrder, isUpcoming } from '../../../domain/order/scheduling';
import { orderSettingsOf } from '../../../domain/order/orderSettings';
import { PAYMENT_SERVICE_UNAVAILABLE_ERROR } from '../../../domain/order/orderErrors';
import { generateOrderRef } from '../../../domain/order/orderRef';
import {
  deleteCheckoutSession,
  findCheckoutSessionById,
} from '../../../infrastructure/cosmos/order/CosmosCheckoutSessionRepository';
import { createOrder, findOrderById } from '../../../infrastructure/cosmos/order/CosmosOrderRepository';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { releaseAuthorization } from '../../../infrastructure/stripe/stripeClient';
import { acceptPlacedOrder } from '../_shared/acceptPlacedOrder';
import { fixSlotPlace } from '../_shared/slotPlaces';
import { notifyCustomer } from '../notifications/notifyOrder';
import { buildPlacedOrderFromSession } from './buildPlacedOrderFromSession';

export type PaymentAuthorizedOutcome = 'created' | 'duplicate' | 'released_orphan' | 'no_session';

/**
 * Stripe says the diner's card money is reserved: the order now comes into being (placed, reserved).
 * With auto-accept on it is accepted right away; if the payment service is down it waits for the timer.
 * A reservation with no checkout left (the diner idled for over an hour) is released and no order is made.
 */
export async function executeHandlePaymentAuthorized(input: {
  sessionId: string;
  paymentIntentId: string;
  connectAccountId?: string | null;
  now?: Date;
}): Promise<PaymentAuthorizedOutcome> {
  const now = input.now ?? new Date();
  const session = await findCheckoutSessionById(input.sessionId);
  if (!session) {
    // The session is deleted once the order exists, so a repeated delivery lands here too.
    if (await findOrderById(input.sessionId)) return 'duplicate';
    if (!input.connectAccountId) return 'no_session';
    await releaseAuthorization({
      connectAccountId: input.connectAccountId,
      paymentIntentId: input.paymentIntentId,
      idempotencyKey: `release-orphan-${input.paymentIntentId}`,
    });
    return 'released_orphan';
  }

  const shop = await findShopById(session.shopId);
  if (!shop) throw new Error(`Shop ${session.shopId} not found for session ${session.id}`);
  const settings = orderSettingsOf(shop);
  // A booked order that is not due yet waits quietly; one that is due already (the diner idled on the payment step) starts now.
  const inLiveQueue =
    !session.scheduledFor ||
    !isUpcoming({ state: 'PLACED', scheduledFor: session.scheduledFor, fulfilmentMode: session.fulfilmentMode }, shop, now);
  const order = buildPlacedOrderFromSession({
    session,
    paymentIntentId: input.paymentIntentId,
    orderRef: session.orderRef ?? generateOrderRef(),
    autoRejectMinutes: settings.autoRejectMinutes,
    now,
    inLiveQueue,
  });
  try {
    await createOrder(order);
  } catch (err: unknown) {
    if ((err as { code?: number })?.code === 409) {
      if (session.scheduledFor) await fixSlotPlace({ shop, orderId: session.id, slot: session.scheduledFor, now });
      await deleteCheckoutSession(session.id);
      return 'duplicate';
    }
    throw err;
  }
  await deleteCheckoutSession(session.id);
  // The card is reserved: the booked place is kept for good, even if its hold lapsed meanwhile.
  if (order.scheduledFor) await fixSlotPlace({ shop, orderId: order.id, slot: order.scheduledFor, now });

  // Auto-accepted orders get one email (the acceptance); a received email would arrive a second before it.
  const autoAccepts = autoAcceptsOrder(shop, order);
  let sendReceived = !autoAccepts;
  if (autoAccepts) {
    try {
      const accepted = await acceptPlacedOrder({ orderId: order.id, shop, actor: { type: 'system' }, now });
      // Still waiting (Stripe outage): the diner is told it was received, and the timer retries.
      sendReceived = !accepted.ok && accepted.error === PAYMENT_SERVICE_UNAVAILABLE_ERROR;
    } catch {
      console.error('[auto-accept:error]', order.id);
      sendReceived = true;
    }
  }
  if (sendReceived) await notifyCustomer('order_received', order, shop);
  return 'created';
}
