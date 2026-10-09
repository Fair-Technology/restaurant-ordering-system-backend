import { capDiscount, discountCentsFor, type DiscountOffer } from '../../domain/order/discount';
import type { OrderDiscountKind } from '../../domain/order/Order';
import { localDate } from '../../domain/order/orderTimers';
import {
  countsAsUse,
  isVoucherCode,
  type DiscountProblem,
  type ShopPromotionsDoc,
} from '../../domain/promotion/promotions';
import type { Shop } from '../../domain/shop/Shop';
import { findDiscountUseRows } from '../../infrastructure/cosmos/order/CosmosOrderRepository';
import { findVoucher } from '../../infrastructure/cosmos/promotion/CosmosPromotionRepository';

export type DiscountResolution =
  | { ok: true; offer: DiscountOffer }
  | { ok: false; problem: DiscountProblem; minSubtotalCents: number | null };

/** Whether a (normalised) code applies to this basket right now, and for how many cents. */
export async function resolveDiscount(input: {
  shop: Pick<Shop, 'id' | 'timezone'>;
  promotions: ShopPromotionsDoc | null;
  code: string;
  subtotalCents: number;
  chargesCents: number;
  emailLower: string | null; // null in the quote: the per-diner limit is checked at checkout only
  now: Date;
}): Promise<DiscountResolution> {
  const fail = (problem: DiscountProblem, min: number | null = null): DiscountResolution => ({ ok: false, problem, minSubtotalCents: min });
  const today = localDate(input.now, input.shop.timezone);
  let kind: OrderDiscountKind;
  let raw: number;
  let totalLimit: number | null;
  let perEmailLimit: number | null;
  if (isVoucherCode(input.code)) {
    const v = await findVoucher(input.shop.id, input.code);
    if (!v) return fail('unknown');
    if (today > v.expiresOn) return fail('expired');
    kind = 'voucher';
    raw = v.amountCents;
    totalLimit = 1;
    perEmailLimit = null;
  } else {
    const c = input.promotions?.codes.find((x) => x.code === input.code);
    if (!c || !c.active) return fail('unknown');
    if (c.validFrom && today < c.validFrom) return fail('not_started');
    if (c.validUntil && today > c.validUntil) return fail('expired');
    if (input.subtotalCents < c.minSubtotalCents) return fail('minimum', c.minSubtotalCents);
    kind = 'code';
    raw = discountCentsFor(c, input.subtotalCents);
    totalLimit = c.totalLimit;
    perEmailLimit = c.perEmailLimit;
  }
  const cents = capDiscount(raw, input.subtotalCents, input.chargesCents);
  if (cents <= 0) return fail('too_small');
  if (totalLimit !== null || (input.emailLower !== null && perEmailLimit !== null)) {
    const used = (await findDiscountUseRows(input.shop.id, input.code)).filter(countsAsUse);
    if (totalLimit !== null && used.length >= totalLimit) return fail('used_up');
    if (
      input.emailLower !== null &&
      perEmailLimit !== null &&
      used.filter((r) => r.customerEmail.trim().toLowerCase() === input.emailLower).length >= perEmailLimit
    ) {
      return fail('already_used');
    }
  }
  return { ok: true, offer: { kind, code: input.code, cents } };
}
