import { FulfilmentMode } from '../../../domain/order/Order';

export interface CheckoutItemDto {
  productId: string;
  quantity: number;
  selectedVariantOptionId?: string;
  selectedAddonOptionIds?: string[];
}

export interface CheckoutRequestDto {
  shopId: string;
  items: CheckoutItemDto[];
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerNotes?: string;
  fulfilmentMode?: FulfilmentMode; // absent → 'collection'
}

export interface CheckoutResultDto {
  sessionId: string;
  clientSecret: string;
  subtotalCents: number;
  currency: string;
  stripeConnectAccountId: string;
}
