import type { FulfilmentMode, OrderDiscountKind, PaymentMethod } from '../../../domain/order/Order';
import type { CheckoutItemDto } from '../checkout/dtos';
import type { DiscountProblem } from '../../../domain/promotion/promotions';
import type { LineStatus } from '../_shared/priceBasket';

export interface QuoteBasketRequestDto {
  shopId: string;
  items: CheckoutItemDto[];
  fulfilmentMode?: FulfilmentMode;
  language?: string;
  postcode?: string; // read for delivery only
  scheduledFor?: string; // a slot start; prices the basket for that time
  discountCode?: string; // a discount or voucher code the diner typed
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
  totalCents: number; // subtotal + fee - discount
  postcodeServed: boolean | null; // null unless the mode is delivery
  taxCents: number;
  minOrderAmountCents: number;
  belowMinimum: boolean;
  openNow: boolean;
  paymentMethods: PaymentMethod[];
  addressRequired: boolean; // the diner must give an address for this total
  prepMinutes: number;
  orderLimitReached: boolean; // the monthly order limit is used up, so checkout would refuse
  slots: string[]; // bookable slot starts for this mode ([] = orders for later are not offered)
  scheduledFor: string | null; // the parsed slot echoed back, null when none was sent
  slotAvailable: boolean | null; // null when no scheduledFor was sent
  acceptsCodes: boolean; // the restaurant has a live code or runs loyalty, so checkout shows the code box
  discount: { kind: OrderDiscountKind; code: string; cents: number } | null;
  discountProblem: DiscountProblem | null; // null when no code was sent or it applies
  discountMinSubtotalCents: number | null; // set with problem 'minimum'
  loyalty: { everyOrders: number; rewardCents: number } | null;
}
