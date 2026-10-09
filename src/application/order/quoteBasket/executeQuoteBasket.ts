import { menuLanguagesOf, resolveMenuLanguage } from '../../../domain/menu/menuLanguage';
import { orderableModesFor } from '../../../domain/order/fulfilment';
import { chargesTotalCents, deliveryFeeCharge, findDeliveryZone, hoursForMode } from '../../../domain/order/delivery';
import { applyDiscount } from '../../../domain/order/discount';
import { localDate } from '../../../domain/order/orderTimers';
import { buildTaxBreakdownWithCharges } from '../../../domain/order/tax';
import { acceptsCodes, loyaltyOffer, normaliseCode } from '../../../domain/promotion/promotions';
import { MODE_NOT_OFFERED_ERROR, SCHEDULED_FOR_ERROR } from '../../../domain/order/orderErrors';
import { effectivePrepMinutes, lastOrdersLeadMinutes } from '../../../domain/order/kitchenTiming';
import { isOpenForAsapOrder } from '../../../domain/order/openingHours';
import { addressRequired, FULFILMENT_MODES } from '../../../domain/order/Order';
import { isBookableSlot, listSlots, parseSlotStart } from '../../../domain/order/scheduling';
import { offeredPaymentMethods } from '../../../domain/order/paymentMethods';
import { findPromotions } from '../../../infrastructure/cosmos/promotion/CosmosPromotionRepository';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { ApplicationResult } from '../../_shared/types';
import { resolveDiscount, type DiscountResolution } from '../../promotion/resolveDiscount';
import { loadOrderLimitStatus } from '../../usage/orderLimitStatus';
import { loadPricingContext } from '../_shared/loadPricingContext';
import { basketProductIds, priceBasket, validateBasketItems } from '../_shared/priceBasket';
import { BasketQuoteDto, QuoteBasketRequestDto } from './dtos';

/** Re-prices a basket for the diner without placing anything, so changes can be shown before they order. */
export async function executeQuoteBasket(
  request: QuoteBasketRequestDto,
  options: { now?: Date } = {},
): Promise<ApplicationResult<BasketQuoteDto>> {
  if (!request.shopId || typeof request.shopId !== 'string') {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required' };
  }
  const itemsError = validateBasketItems(request.items);
  if (itemsError) return { ok: false, code: 'INVALID_INPUT', error: itemsError };

  const mode = request.fulfilmentMode ?? 'collection';
  if (!FULFILMENT_MODES.includes(mode)) {
    return { ok: false, code: 'INVALID_INPUT', error: 'fulfilmentMode must be one of collection, delivery, dine_in' };
  }

  let slot: Date | null = null;
  if (request.scheduledFor !== undefined && request.scheduledFor !== null) {
    slot = parseSlotStart(request.scheduledFor);
    if (!slot) return { ok: false, code: 'INVALID_INPUT', error: SCHEDULED_FOR_ERROR };
  }

  try {
    const now = options.now ?? new Date();
    const shop = await findShopById(request.shopId);
    if (!shop || shop.isDeleted) return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
    if (shop.isPaused) {
      return {
        ok: false,
        code: 'INVALID_INPUT',
        error: shop.pausedMessage ? shop.pausedMessage : 'This shop is not currently accepting orders',
      };
    }
    if (!orderableModesFor(shop).includes(mode)) {
      return { ok: false, code: 'INVALID_INPUT', error: MODE_NOT_OFFERED_ERROR };
    }
    const limit = await loadOrderLimitStatus(shop, now);

    const context = await loadPricingContext(shop, basketProductIds(request.items));
    const language = resolveMenuLanguage(request.language, menuLanguagesOf(shop));
    const pricedAt = slot ?? now;
    const priced = priceBasket({ items: request.items, ...context, shop, mode, now: pricedAt, language });
    const prepMinutes = effectivePrepMinutes(shop, mode, now);
    const zone = mode === 'delivery' ? findDeliveryZone(shop, request.postcode) : null;
    const fee = zone ? deliveryFeeCharge(shop, zone, context.refs, pricedAt) : null;
    const charges = fee ? [fee] : [];
    const promotions = await findPromotions(shop.id);
    const code =
      request.discountCode === undefined || request.discountCode === null || request.discountCode === ''
        ? null
        : normaliseCode(request.discountCode);
    let resolution: DiscountResolution | null = null;
    if (request.discountCode && !code) resolution = { ok: false, problem: 'unknown', minSubtotalCents: null };
    else if (code) {
      resolution = await resolveDiscount({
        shop,
        promotions,
        code,
        subtotalCents: priced.subtotalCents,
        chargesCents: chargesTotalCents(charges),
        emailLower: null,
        now,
      });
    }
    const applied = resolution?.ok ? applyDiscount(priced.items, charges, resolution.offer) : null;
    const totalCents = applied ? applied.totalCents : priced.subtotalCents + chargesTotalCents(charges);
    const taxBreakdown = applied ? applied.taxBreakdown : buildTaxBreakdownWithCharges(priced.items, charges);
    const minimum = zone ? zone.minOrderCents : shop.minOrderAmountCents;

    return {
      ok: true,
      data: {
        currency: shop.currency,
        fulfilmentMode: mode,
        lines: priced.lines.map((l) => ({
          index: l.index,
          productId: l.productId,
          name: l.displayName,
          quantity: request.items[l.index].quantity,
          status: l.status,
          unitPriceCents: l.unitPriceCents,
          expectedUnitPriceCents: l.expectedUnitPriceCents,
          lineTotalCents: l.lineTotalCents,
        })),
        subtotalCents: priced.subtotalCents,
        taxCents: taxBreakdown.reduce((sum, t) => sum + t.taxCents, 0),
        minOrderAmountCents: minimum,
        belowMinimum: priced.subtotalCents < minimum,
        openNow: isOpenForAsapOrder(hoursForMode(shop, mode), shop.closures, shop.timezone, now, lastOrdersLeadMinutes(shop, mode)),
        paymentMethods: offeredPaymentMethods(shop),
        addressRequired: addressRequired(totalCents),
        deliveryFeeCents: zone ? zone.feeCents : null,
        totalCents,
        postcodeServed: mode === 'delivery' ? zone !== null : null,
        prepMinutes,
        orderLimitReached: limit.limitReached,
        slots: listSlots(shop, mode, now),
        scheduledFor: slot ? slot.toISOString() : null,
        slotAvailable: slot ? isBookableSlot(shop, mode, slot, now) : null,
        acceptsCodes: acceptsCodes(promotions, localDate(now, shop.timezone)),
        discount: applied ? { kind: applied.discount.kind, code: applied.discount.code, cents: applied.discount.cents } : null,
        discountProblem: resolution && !resolution.ok ? resolution.problem : null,
        discountMinSubtotalCents: resolution && !resolution.ok ? resolution.minSubtotalCents : null,
        loyalty: loyaltyOffer(promotions),
      },
    };
  } catch {
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Quote failed' };
  }
}
