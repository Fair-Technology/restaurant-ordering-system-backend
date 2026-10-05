import { Shop, stripeReady } from '../shop/Shop';
import type { PaymentMethod } from './Order';

/** What a diner may pay with at this restaurant: card, once Stripe onboarding is complete; nothing before. */
export function offeredPaymentMethods(shop: Pick<Shop, 'stripe'>): PaymentMethod[] {
  return stripeReady(shop) ? ['card'] : [];
}
