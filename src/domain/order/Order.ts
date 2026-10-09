import type { MenuLanguage } from '../reference/ReferenceLists';

export type OrderState =
  | 'PLACED'
  | 'ACCEPTED'
  | 'IN_PREPARATION'
  | 'READY'
  | 'OUT_FOR_DELIVERY'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED';

export type StoredOrderState = Exclude<OrderState, 'IN_PREPARATION'>;

export type FulfilmentMode = 'collection' | 'delivery' | 'dine_in';

export const FULFILMENT_MODES: readonly FulfilmentMode[] = ['collection', 'delivery', 'dine_in'];

export type PaymentMethod = 'card';

export type PaymentStatus = 'authorized' | 'paid' | 'partially_refunded' | 'refunded' | 'canceled';
/** What the app shows: stored values the code does not know (old pay-in-person orders) read as 'not_paid_online'. */
export type DisplayPaymentStatus = PaymentStatus | 'not_paid_online';

export interface OrderPayment {
  method: PaymentMethod;
  status: PaymentStatus;
  stripePaymentIntentId: string | null;
}

export type OrderActor =
  | { type: 'system' }
  | { type: 'customer' }
  | { type: 'owner' | 'staff' | 'superadmin'; id: string };

export interface OrderHistoryEntry {
  from: StoredOrderState | null;
  to: StoredOrderState;
  at: string; // ISO
  actor: OrderActor;
  reason?: string; // present only on REJECTED / CANCELLED
}

export const REJECT_REASON_CODES = ['too_busy', 'item_unavailable', 'closing_soon', 'other'] as const;
export type StaffRejectReason = (typeof REJECT_REASON_CODES)[number];
export type RejectReason = StaffRejectReason | 'no_response' | 'payment_failed'; // 'no_response' = automatic decline
export const CUSTOMER_CANCEL_REASON = 'customer_cancelled';

export interface TaxBreakdownEntry {
  rateBasisPoints: number;
  grossCents: number;
  taxCents: number;
}

export interface CustomerAddress {
  street: string;
  postcode: string;
  city: string;
  country: string;
}

/** Bills of more than 250,00 EUR (strictly) need the diner's address (section 33 UStDV). */
export const ADDRESS_REQUIRED_ABOVE_CENTS = 25000;
export function addressRequired(chargedCents: number): boolean {
  return chargedCents > ADDRESS_REQUIRED_ABOVE_CENTS;
}

/** Where a delivery order goes. Never printed on the invoice; removed by erasure. */
export interface DeliveryAddress {
  street: string;
  postcode: string; // normalised form (no spaces, upper case)
  city: string;
}

export type OrderChargeKind = 'delivery_fee';

/** A line the diner pays besides the dishes, with its own VAT, snapshotted at checkout. */
export interface OrderCharge {
  kind: OrderChargeKind;
  grossCents: number; // > 0 (a zero fee is not stored)
  taxClassId: string | null;
  taxRateBasisPoints: number;
  taxCents: number; // VAT contained in grossCents
}

/** The order's own copy of its table; a later secret code would add `code?: string`. */
export interface OrderTable {
  label: string;
}

export type CorrectionKind = 'cancellation' | 'correction';

/** One ticked order line in an item refund. grossCents = unit price x quantity, at the line's own VAT rate. */
export interface RefundLine {
  lineIndex: number;
  quantity: number;
  grossCents: number;
  taxRateBasisPoints: number;
}

export interface OrderRefund {
  id: string;
  amountCents: number;
  reason: string;
  at: string; // ISO
  actor: OrderActor;
  stripeRefundId: string;
  lines?: RefundLine[]; // present only for item refunds; absent = free amount
  correctionNumber?: string;
  correctionKind?: CorrectionKind;
  correctionEmailedAt?: string; // ISO, written just before the timer emails a late correction
}

export interface PaymentReleaseFailure {
  at: string; // ISO
  message: string;
  notifiedAt: string | null;
  attempts?: number; // failed tries so far; a retry after a failure uses a new Stripe key
}

export interface LegalRevisions {
  terms: number;
  withdrawal: number;
}

export interface OrderItem {
  productId: string;
  productName: string; // snapshot at time of order
  quantity: number;
  unitPriceCents: number; // server-computed (base + variant + addons)
  selectedVariantOptionId?: string;
  selectedVariantOptionName?: string; // snapshot at time of order
  selectedAddonOptionIds?: string[];
  selectedAddonOptionNames?: string[]; // snapshot at time of order
  lineTotalCents: number; // unitPriceCents × quantity
  taxClassId?: string | null; // null = no class resolvable (rate 0)
  taxRateBasisPoints?: number; // rate valid at placement time
  taxCents?: number; // VAT contained in lineTotalCents
}

export interface Order {
  id: string; // === checkout session id (Cosmos pk /id)
  shopId: string;
  orderRef: string; // human-readable e.g. "AB3-K7P"
  state: StoredOrderState;
  fulfilmentMode: FulfilmentMode;
  payment: OrderPayment;
  items: OrderItem[];
  subtotalCents: number; // sum of all lineTotalCents (server-computed)
  currency: string; // from shop (e.g. "EUR")
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerNotes?: string;
  customerAddress?: CustomerAddress; // optional; required above ADDRESS_REQUIRED_ABOVE_CENTS
  deliveryAddress?: DeliveryAddress; // delivery orders only; never on the invoice; removed by erasure
  charges?: OrderCharge[]; // absent = none (all orders before slice 8b)
  totalCents?: number; // subtotalCents + sum of charges; absent before 8b, read via chargedCents
  table?: OrderTable; // dine_in orders only
  scheduledFor?: string; // ISO start of the booked 15-minute slot = the promised ready / delivery time. Absent = as soon as possible
  queuedAt?: string; // ISO, when a scheduled order entered the live queue; the alert and decline count from here
  refunds?: OrderRefund[];
  releaseFailure?: PaymentReleaseFailure; // the reservation could not be released yet
  invoiceNumber?: string; // set once the invoice is issued
  invoiceEmailedAt?: string; // ISO, written just before the timer emails a late invoice
  captureStartedAt?: string; // ISO, claim written just before the money is taken
  captureAttempts?: number; // claims written so far; a retry after a failed capture uses a new Stripe key
  anonymisedAt?: string; // ISO, set only by customer erasure
  acceptedAt?: string; // ISO, set by ACCEPTED
  readyAt?: string; // ISO, set by ACCEPTED
  prepMinutes?: number; // set by ACCEPTED
  usagePeriodKey?: string; // 'YYYY-MM' in shop tz, set with ACCEPTED
  taxBreakdown?: TaxBreakdownEntry[]; // absent on orders from before slice 4
  language?: MenuLanguage; // the diner's menu language, used for emails
  legalRevisions?: LegalRevisions; // terms/withdrawal revisions the diner was shown
  customerAccessToken?: string; // secret order-page link token; removed by erasure and export
  idempotencyKey?: string;
  autoRejectAt?: string; // ISO, set only when the order needs manual acceptance
  escalatedAt?: string; // ISO, written just before the escalation email
  rejectionNote?: string; // staff-only, never shown to the diner
  history: OrderHistoryEntry[];
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export const DEFAULT_PREP_MINUTES: Record<FulfilmentMode, number> = {
  collection: 20,
  dine_in: 20,
  delivery: 45,
};

/** What the diner pays for this order. Orders from before slice 8b have no totalCents. */
export function chargedCents(o: Pick<Order, 'subtotalCents' | 'totalCents'>): number {
  return o.totalCents ?? o.subtotalCents;
}

/** The delivery fee of a delivery order (0 when free); null for collection and table orders. */
export function deliveryFeeCentsOf(o: Pick<Order, 'fulfilmentMode' | 'charges'>): number | null {
  if (o.fulfilmentMode !== 'delivery') return null;
  return (o.charges ?? []).filter((c) => c.kind === 'delivery_fee').reduce((s, c) => s + c.grossCents, 0);
}
