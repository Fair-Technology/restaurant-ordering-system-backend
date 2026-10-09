import { CheckoutSession } from '../../../domain/order/CheckoutSession';
import { Order } from '../../../domain/order/Order';

/**
 * The one place a paid-for checkout becomes an order: placed, with the card money reserved.
 * It copies the session's fulfilment mode, table and booked time as they are.
 */
export function buildPlacedOrderFromSession(input: {
  session: CheckoutSession;
  paymentIntentId: string;
  orderRef: string;
  autoRejectMinutes: number;
  now: Date;
  inLiveQueue?: boolean; // default true; false = a scheduled order not yet due: no decline time, no queuedAt
}): Order {
  const { session } = input;
  const queued = input.inLiveQueue ?? true;
  const at = input.now.toISOString();
  return {
    id: session.id,
    shopId: session.shopId,
    orderRef: input.orderRef,
    state: 'PLACED',
    fulfilmentMode: session.fulfilmentMode,
    payment: { method: 'card', status: 'authorized', stripePaymentIntentId: input.paymentIntentId },
    items: session.items,
    subtotalCents: session.subtotalCents,
    currency: session.currency,
    customerName: session.customerName,
    customerEmail: session.customerEmail,
    customerPhone: session.customerPhone,
    ...(session.customerNotes ? { customerNotes: session.customerNotes } : {}),
    ...(session.customerAddress ? { customerAddress: session.customerAddress } : {}),
    ...(session.table ? { table: session.table } : {}),
    ...(session.scheduledFor ? { scheduledFor: session.scheduledFor } : {}),
    ...(session.scheduledFor && queued ? { queuedAt: at } : {}),
    ...(session.deliveryAddress ? { deliveryAddress: session.deliveryAddress } : {}),
    ...(session.charges ? { charges: session.charges } : {}),
    ...(session.totalCents !== undefined ? { totalCents: session.totalCents } : {}),
    ...(session.taxBreakdown ? { taxBreakdown: session.taxBreakdown } : {}),
    ...(session.language ? { language: session.language } : {}),
    ...(session.legalRevisions ? { legalRevisions: session.legalRevisions } : {}),
    ...(session.customerAccessToken ? { customerAccessToken: session.customerAccessToken } : {}),
    ...(session.idempotencyKey ? { idempotencyKey: session.idempotencyKey } : {}),
    ...(queued ? { autoRejectAt: new Date(input.now.getTime() + input.autoRejectMinutes * 60_000).toISOString() } : {}),
    history: [{ from: null, to: 'PLACED', at, actor: { type: 'customer' } }],
    createdAt: at,
    updatedAt: at,
  };
}
