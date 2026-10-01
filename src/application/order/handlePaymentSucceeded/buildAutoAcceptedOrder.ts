import { applyTransition } from '../../../domain/order/orderLifecycle';
import { CheckoutSession } from '../../../domain/order/CheckoutSession';
import { DEFAULT_PREP_MINUTES, Order } from '../../../domain/order/Order';
import { periodKeyFor } from '../../../domain/usage/usagePeriod';

export function buildAutoAcceptedOrder(input: {
  session: CheckoutSession;
  paymentIntentId: string;
  orderRef: string;
  now: Date;
  timeZone: string;
}): Order {
  const { session } = input;
  const at = input.now.toISOString();
  const placed: Order = {
    id: session.id,
    shopId: session.shopId,
    orderRef: input.orderRef,
    state: 'PLACED',
    fulfilmentMode: session.fulfilmentMode,
    payment: { method: 'card', status: 'paid', stripePaymentIntentId: input.paymentIntentId },
    items: session.items,
    subtotalCents: session.subtotalCents,
    currency: session.currency,
    customerName: session.customerName,
    customerEmail: session.customerEmail,
    customerPhone: session.customerPhone,
    ...(session.customerNotes ? { customerNotes: session.customerNotes } : {}),
    history: [{ from: null, to: 'PLACED', at, actor: { type: 'system' } }],
    createdAt: at,
    updatedAt: at,
  };
  const prepMinutes = DEFAULT_PREP_MINUTES[session.fulfilmentMode];
  const res = applyTransition(placed, 'ACCEPTED', {
    now: input.now,
    actor: { type: 'system' },
    readyAt: new Date(input.now.getTime() + prepMinutes * 60_000),
    prepMinutes,
  });
  if (!res.ok) throw new Error(`auto-accept failed: ${res.error}`);
  return { ...res.order, usagePeriodKey: periodKeyFor(input.now, input.timeZone) };
}
