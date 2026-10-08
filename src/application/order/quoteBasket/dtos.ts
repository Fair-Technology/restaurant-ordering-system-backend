import type { FulfilmentMode, PaymentMethod } from '../../../domain/order/Order';
import type { CheckoutItemDto } from '../checkout/dtos';
import type { LineStatus } from '../_shared/priceBasket';

export interface QuoteBasketRequestDto {
  shopId: string;
  items: CheckoutItemDto[];
  fulfilmentMode?: FulfilmentMode;
  language?: string;
  postcode?: string; // read for delivery only
}

export interface QuoteLineDto {
  index: number;
  productId: string;
  name: string | null;
  quantity: number;
  status: LineStatus;
  unitPriceCents: number | null;
  expectedUnitPriceCents: number | null;
  lineTotalCents: number | null;
}

export interface BasketQuoteDto {
  currency: string;
  fulfilmentMode: FulfilmentMode;
  lines: QuoteLineDto[];
  subtotalCents: number;
  deliveryFeeCents: number | null; // null unless delivery to a served postcode
  totalCents: number; // subtotal + fee
  postcodeServed: boolean | null; // null unless the mode is delivery
  taxCents: number;
  minOrderAmountCents: number;
  belowMinimum: boolean;
  openNow: boolean;
  paymentMethods: PaymentMethod[];
  addressRequired: boolean; // the diner must give an address for this total
  prepMinutes: number;
  orderLimitReached: boolean; // the monthly order limit is used up, so checkout would refuse
}
