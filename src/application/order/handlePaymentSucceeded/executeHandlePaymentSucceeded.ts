import { generateOrderRef } from '../../../domain/order/orderRef';
import {
  deleteCheckoutSession,
  findCheckoutSessionById,
} from '../../../infrastructure/cosmos/order/CosmosCheckoutSessionRepository';
import { createOrder } from '../../../infrastructure/cosmos/order/CosmosOrderRepository';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { buildAutoAcceptedOrder } from './buildAutoAcceptedOrder';

export type PaymentSucceededOutcome = 'created' | 'duplicate' | 'no_session';

export async function executeHandlePaymentSucceeded(input: {
  sessionId: string;
  paymentIntentId: string;
  now?: Date;
}): Promise<PaymentSucceededOutcome> {
  const now = input.now ?? new Date();
  const session = await findCheckoutSessionById(input.sessionId);
  if (!session) return 'no_session';
  const shop = await findShopById(session.shopId);
  if (!shop) throw new Error(`Shop ${session.shopId} not found for session ${session.id}`);
  const order = buildAutoAcceptedOrder({
    session,
    paymentIntentId: input.paymentIntentId,
    orderRef: generateOrderRef(),
    now,
    timeZone: shop.timezone,
  });
  try {
    await createOrder(order);
  } catch (err: any) {
    if (err?.code === 409) {
      await deleteCheckoutSession(session.id);
      return 'duplicate';
    }
    throw err;
  }
  // step 16 inserts: await incrementAcceptedOrders(order.shopId, order.usagePeriodKey!);
  await deleteCheckoutSession(session.id);
  return 'created';
}
