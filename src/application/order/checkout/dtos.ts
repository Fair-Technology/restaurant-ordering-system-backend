import { FulfilmentMode, LegalRevisions, PaymentMethod } from '../../../domain/order/Order';

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
  idempotencyKey?: string;
  language?: string;
  legalRevisions?: LegalRevisions;
}

export interface CardCheckoutResultDto {
  kind: 'card';
  sessionId: string;
  clientSecret: string;
  subtotalCents: number;
  currency: string;
  stripeConnectAccountId: string;
}

export type CheckoutResultDto = CardCheckoutResultDto;
