import { CustomerAddress, DeliveryAddress, FulfilmentMode, LegalRevisions, PaymentMethod } from '../../../domain/order/Order';

export interface CheckoutItemDto {
  productId: string;
  quantity: number;
  selectedVariantOptionId?: string;
  selectedAddonOptionIds?: string[];
  expectedUnitPriceCents?: number; // what the diner was shown; a mismatch is reported back, never trusted
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
  totalCents: number; // what is reserved on the card: dishes plus delivery fee
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
