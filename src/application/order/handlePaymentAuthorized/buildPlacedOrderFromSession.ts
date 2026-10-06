import { CheckoutSession } from '../../../domain/order/CheckoutSession';
import { Order } from '../../../domain/order/Order';

/**
 * The one place a paid-for checkout becomes an order: placed, with the card money reserved.
 * It copies the session's fulfilment mode and table as they are.
 */
export function buildPlacedOrderFromSession(input: {
  session: CheckoutSession;
  paymentIntentId: string;
  orderRef: string;
  autoRejectMinutes: number;
  now: Date;
}): Order {
  const { session } = input;
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
    ...(session.taxBreakdown ? { taxBreakdown: session.taxBreakdown } : {}),
    ...(session.language ? { language: session.language } : {}),
    ...(session.legalRevisions ? { legalRevisions: session.legalRevisions } : {}),
    ...(session.customerAccessToken ? { customerAccessToken: session.customerAccessToken } : {}),
    ...(session.idempotencyKey ? { idempotencyKey: session.idempotencyKey } : {}),
    autoRejectAt: new Date(input.now.getTime() + input.autoRejectMinutes * 60_000).toISOString(),
    history: [{ from: null, to: 'PLACED', at, actor: { type: 'customer' } }],
    createdAt: at,
    updatedAt: at,
  };
}
