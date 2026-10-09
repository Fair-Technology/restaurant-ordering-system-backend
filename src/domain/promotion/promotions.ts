import { randomInt } from 'crypto';
import { localDate } from '../order/orderTimers';
import type { StoredOrderState } from '../order/Order';

export type DiscountCodeKind = 'percent' | 'amount';

export interface DiscountCode {
  id: string; // randomUUID()
  code: string; // normalised (upper case), unique per restaurant, never reused
  kind: DiscountCodeKind;
  percent: number | null; // 1-100 when kind 'percent', else null
  amountCents: number | null; // 1-10000 when kind 'amount', else null
  minSubtotalCents: number; // dishes before discount; 0 = no minimum
  validFrom: string | null; // 'YYYY-MM-DD' shop-local, inclusive; null = from creation
  validUntil: string | null; // 'YYYY-MM-DD' shop-local, inclusive; null = no end
  totalLimit: number | null; // 1-100000; null = unlimited
  perEmailLimit: number | null; // 1-100; null = unlimited
  active: boolean;
  createdAt: string; // ISO
}

export interface LoyaltyRule {
  enabled: boolean;
  everyOrders: number; // 2-20
  rewardCents: number; // 100-5000
  validDays: number; // 7-365
  since: string | null; // ISO, set whenever enabled turns true; null = never switched on
}

export interface ShopPromotionsDoc {
  id: string; // promotionsDocId(shopId)
  kind: 'shop_promotions';
  shopId: string;
  codes: DiscountCode[]; // newest last; at most MAX_CODES
  loyalty: LoyaltyRule | null;
  updatedAt: string;
}

export interface LoyaltyVoucherDoc {
  id: string; // voucherDocId(shopId, code)
  kind: 'loyalty_voucher';
  shopId: string;
  code: string; // 'L-' + 8 characters
  amountCents: number;
  expiresOn: string; // 'YYYY-MM-DD' shop-local, inclusive
  sourceOrderId: string;
  createdAt: string;
}

export type DiscountProblem = 'unknown' | 'not_started' | 'expired' | 'used_up' | 'already_used' | 'minimum' | 'too_small';

export const MAX_CODES = 50;
export const MIN_CHARGE_CENTS = 50; // Stripe's EUR minimum
export const DEFAULT_LOYALTY: Omit<LoyaltyRule, 'since'> = { enabled: false, everyOrders: 5, rewardCents: 500, validDays: 90 };
const CODE_PATTERN = /^[A-Z0-9-]{3,20}$/;
const VOUCHER_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const VOUCHER_PATTERN = /^L-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;
const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const DISCOUNT_CODE_ERROR = 'code must be 3 to 20 letters, digits or dashes';
export const DISCOUNT_CODE_RESERVED_ERROR = 'Codes starting with L- are reserved for loyalty vouchers';
export const DISCOUNT_VALUE_ERROR = 'A percentage must be 1 to 100; an amount must be 1 cent to 100 €';
export const DISCOUNT_MINIMUM_ERROR = 'minSubtotalCents must be a whole number from 0 to 100000';
export const DISCOUNT_DATES_ERROR = 'validFrom and validUntil must be dates (YYYY-MM-DD), the end not before the start';
export const DISCOUNT_LIMIT_ERROR = 'totalLimit must be 1 to 100000 and perEmailLimit 1 to 100, or null';
export const DISCOUNT_CODE_EXISTS_ERROR = 'This code already exists for this restaurant';
export const DISCOUNT_CODE_LIMIT_ERROR = 'A restaurant can have at most 50 codes';
export const DISCOUNT_CODE_NOT_FOUND_ERROR = 'Discount code not found';
export const DISCOUNT_ACTIVE_ERROR = 'active must be true or false';
export const LOYALTY_RULE_ERROR = 'everyOrders must be 2 to 20, rewardCents 100 to 5000, validDays 7 to 365, enabled true or false';
export const PROMOTIONS_CONFLICT_ERROR = 'The discounts were changed at the same time. Please try again.';

export function promotionsDocId(shopId: string): string {
  return `promotions_${shopId}`;
}

export function voucherDocId(shopId: string, code: string): string {
  return `voucher_${shopId}_${code}`;
}

/** A code a diner or owner typed, upper-cased and trimmed; null when it is not a possible code. */
export function normaliseCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const c = raw.trim().toUpperCase();
  return CODE_PATTERN.test(c) ? c : null;
}

export function isVoucherCode(code: string): boolean {
  return VOUCHER_PATTERN.test(code);
}

export function generateVoucherCode(randomIndex: (max: number) => number = (max) => randomInt(max)): string {
  let s = '';
  for (let i = 0; i < 8; i++) s += VOUCHER_ALPHABET[randomIndex(VOUCHER_ALPHABET.length)];
  return `L-${s}`;
}

function isInt(v: unknown, lo: number, hi: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
}

/** A calendar date or null when absent; undefined when present but not a real date. */
function readDate(v: unknown): string | null | undefined {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string' || !LOCAL_DATE.test(v)) return undefined;
  const parsed = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== v ? undefined : v;
}

/** Validates a new code from the owner's request body. */
export function parseNewDiscountCode(body: Record<string, unknown>, ids: { id: string; now: Date }): DiscountCode | { error: string } {
  const code = normaliseCode(body.code);
  if (!code) return { error: DISCOUNT_CODE_ERROR };
  if (code.startsWith('L-')) return { error: DISCOUNT_CODE_RESERVED_ERROR };
  let percent: number | null = null;
  let amountCents: number | null = null;
  if (body.kind === 'percent') {
    if (!isInt(body.percent, 1, 100)) return { error: DISCOUNT_VALUE_ERROR };
    percent = body.percent;
  } else if (body.kind === 'amount') {
    if (!isInt(body.amountCents, 1, 10000)) return { error: DISCOUNT_VALUE_ERROR };
    amountCents = body.amountCents;
  } else {
    return { error: DISCOUNT_VALUE_ERROR };
  }
  const min = body.minSubtotalCents ?? 0;
  if (!isInt(min, 0, 100000)) return { error: DISCOUNT_MINIMUM_ERROR };
  const validFrom = readDate(body.validFrom);
  const validUntil = readDate(body.validUntil);
  if (validFrom === undefined || validUntil === undefined || (validFrom && validUntil && validUntil < validFrom)) {
    return { error: DISCOUNT_DATES_ERROR };
  }
  const total = body.totalLimit ?? null;
  const perEmail = body.perEmailLimit === undefined ? 1 : body.perEmailLimit;
  if ((total !== null && !isInt(total, 1, 100000)) || (perEmail !== null && !isInt(perEmail, 1, 100))) {
    return { error: DISCOUNT_LIMIT_ERROR };
  }
  return {
    id: ids.id,
    code,
    kind: body.kind,
    percent,
    amountCents,
    minSubtotalCents: min,
    validFrom,
    validUntil,
    totalLimit: total as number | null,
    perEmailLimit: perEmail as number | null,
    active: true,
    createdAt: ids.now.toISOString(),
  };
}

/** Merges a loyalty save into the stored rule; `since` restarts whenever it is switched on. */
export function mergeLoyaltyRule(before: LoyaltyRule | null, body: Record<string, unknown>, now: Date): LoyaltyRule | { error: string } {
  const base: LoyaltyRule = before ?? { ...DEFAULT_LOYALTY, since: null };
  const next: LoyaltyRule = { ...base };
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== 'boolean') return { error: LOYALTY_RULE_ERROR };
    next.enabled = body.enabled;
  }
  if (body.everyOrders !== undefined) {
    if (!isInt(body.everyOrders, 2, 20)) return { error: LOYALTY_RULE_ERROR };
    next.everyOrders = body.everyOrders;
  }
  if (body.rewardCents !== undefined) {
    if (!isInt(body.rewardCents, 100, 5000)) return { error: LOYALTY_RULE_ERROR };
    next.rewardCents = body.rewardCents;
  }
  if (body.validDays !== undefined) {
    if (!isInt(body.validDays, 7, 365)) return { error: LOYALTY_RULE_ERROR };
    next.validDays = body.validDays;
  }
  if (next.enabled && !base.enabled) next.since = now.toISOString();
  return next;
}

/** An order that holds a use of its code: anything except one that ended without ever being accepted. */
export function countsAsUse(o: { state: StoredOrderState; acceptedAt?: string | null }): boolean {
  return (o.acceptedAt !== undefined && o.acceptedAt !== null) || (o.state !== 'REJECTED' && o.state !== 'CANCELLED');
}

/** Whether checkout shows the code box: a code that is on and not past its last day, or loyalty ever switched on. */
export function acceptsCodes(doc: ShopPromotionsDoc | null, today: string): boolean {
  if (!doc) return false;
  return doc.codes.some((c) => c.active && (c.validUntil === null || c.validUntil >= today)) || (doc.loyalty?.since ?? null) !== null;
}

/** What checkout offers for loyalty, or null when it is off. */
export function loyaltyOffer(doc: ShopPromotionsDoc | null): { everyOrders: number; rewardCents: number } | null {
  const r = doc?.loyalty;
  return r && r.enabled ? { everyOrders: r.everyOrders, rewardCents: r.rewardCents } : null;
}

/** A voucher's last valid day: validDays after now, in the restaurant's calendar. */
export function voucherExpiresOn(now: Date, validDays: number, timeZone: string): string {
  return localDate(new Date(now.getTime() + validDays * 86_400_000), timeZone);
}
