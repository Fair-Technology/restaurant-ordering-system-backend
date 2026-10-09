import { CustomerAddress, DeliveryAddress, FulfilmentMode, LegalRevisions, PaymentMethod } from '../../../domain/order/Order';
import type { ComboChoiceInput } from '../_shared/priceBasket';

export interface CheckoutItemDto {
  productId: string;
  quantity: number;
  selectedVariantOptionId?: string;
  selectedAddonOptionIds?: string[];
  expectedUnitPriceCents?: number; // what the diner was shown; a mismatch is reported back, never trusted
  comboChoices?: ComboChoiceInput[]; // a combo: one picked dish per group, with its own size and extras
}

export interface CheckoutRequestDto {
  shopId: string;
  items: CheckoutItemDto[];
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerNotes?: string;
  fulfilmentMode?: FulfilmentMode; // absent → 'collection'
  paymentMethod?: PaymentMethod; // absent → 'card' (what the deployed storefront means)
  customerAddress?: CustomerAddress; // optional; required above ADDRESS_REQUIRED_ABOVE_CENTS
  deliveryAddress?: DeliveryAddress; // required for delivery
  expectedDeliveryFeeCents?: number; // what the diner was shown; a different server fee answers 409
  table?: string; // required (valid) for dine_in; ignored otherwise
  scheduledFor?: string; // a slot start from the quote's slots; absent = as soon as possible
  discountCode?: string; // a discount or voucher code; read case-insensitively
  expectedDiscountCents?: number; // what the diner was shown; a different server discount answers 409
  loyaltyOptIn?: boolean; // the diner asked for loyalty vouchers by email
  idempotencyKey?: string;
  language?: string;
  legalRevisions?: LegalRevisions;
}

export interface CardCheckoutResultDto {
  kind: 'card';
  sessionId: string;
  orderId: string; // the same value as sessionId: the order will carry the session's id
  accessToken: string; // secret order-page link token, created now so the page works while the payment is confirmed
  clientSecret: string;
  subtotalCents: number;
  totalCents: number; // what is reserved on the card: dishes plus delivery fee, minus discount
  currency: string;
  stripeConnectAccountId: string;
}

/** A repeated submit whose order already exists. */
export interface PlacedCheckoutResultDto {
  kind: 'placed';
  orderId: string;
  orderRef: string;
  accessToken: string;
  subtotalCents: number;
  totalCents: number;
  currency: string;
}

export type CheckoutResultDto = CardCheckoutResultDto | PlacedCheckoutResultDto;
