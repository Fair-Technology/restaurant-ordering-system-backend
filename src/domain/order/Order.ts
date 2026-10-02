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

export type PaymentMethod = 'card' | 'cash';

export type PaymentStatus =
  | 'paid'
  | 'refunded'
  | 'partially_refunded'
  | 'cash_due'
  | 'cash_collected'
  | 'refunded_in_cash';

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
export type RejectReason = StaffRejectReason | 'no_response'; // 'no_response' = automatic decline
export const CUSTOMER_CANCEL_REASON = 'customer_cancelled';

export interface TaxBreakdownEntry {
  rateBasisPoints: number;
  grossCents: number;
  taxCents: number;
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
  anonymisedAt?: string; // ISO, set only by customer erasure
  acceptedAt?: string; // ISO, set by ACCEPTED
  readyAt?: string; // ISO, set by ACCEPTED
  prepMinutes?: number; // set by ACCEPTED
  usagePeriodKey?: string; // 'YYYY-MM' in shop tz, set with ACCEPTED
  taxBreakdown?: TaxBreakdownEntry[]; // absent on orders from before slice 4
  language?: MenuLanguage; // the diner's menu language, used for emails
  legalRevisions?: LegalRevisions; // terms/withdrawal revisions the diner was shown
  customerAccessToken?: string; // secret order-page link token; removed by erasure and export
  idempotencyKey?: string; // cash orders only
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
