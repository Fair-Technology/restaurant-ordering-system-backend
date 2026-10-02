import { Shop, stripeReady } from '../shop/Shop';
import type { PaymentMethod } from './Order';

/** What a diner may pay with at this restaurant: card only for online shops with Stripe ready, otherwise cash on collection. */
export function offeredPaymentMethods(shop: Pick<Shop, 'paymentPolicy' | 'stripe'>): PaymentMethod[] {
  if (shop.paymentPolicy === 'pay_online') return stripeReady(shop) ? ['card'] : [];
  return ['cash'];
}
