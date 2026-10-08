import { menuLanguagesOf, resolveMenuLanguage } from '../../../domain/menu/menuLanguage';
import { orderableModesFor } from '../../../domain/order/fulfilment';
import { chargesTotalCents, deliveryFeeCharge, findDeliveryZone, hoursForMode } from '../../../domain/order/delivery';
import { buildTaxBreakdownWithCharges } from '../../../domain/order/tax';
import { MODE_NOT_OFFERED_ERROR } from '../../../domain/order/orderErrors';
import { effectivePrepMinutes, lastOrdersLeadMinutes } from '../../../domain/order/kitchenTiming';
import { isOpenForAsapOrder } from '../../../domain/order/openingHours';
import { addressRequired, FULFILMENT_MODES } from '../../../domain/order/Order';
import { offeredPaymentMethods } from '../../../domain/order/paymentMethods';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { ApplicationResult } from '../../_shared/types';
import { loadOrderLimitStatus } from '../../usage/orderLimitStatus';
import { loadPricingContext } from '../_shared/loadPricingContext';
import { priceBasket, validateBasketItems } from '../_shared/priceBasket';
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

    const context = await loadPricingContext(shop, request.items.map((i) => i.productId));
    const language = resolveMenuLanguage(request.language, menuLanguagesOf(shop));
    const priced = priceBasket({ items: request.items, ...context, shop, mode, now, language });
    const prepMinutes = effectivePrepMinutes(shop, mode, now);
    const zone = mode === 'delivery' ? findDeliveryZone(shop, request.postcode) : null;
    const fee = zone ? deliveryFeeCharge(shop, zone, context.refs, now) : null;
    const charges = fee ? [fee] : [];
    const totalCents = priced.subtotalCents + chargesTotalCents(charges);
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
          unitPriceCents: l.item?.unitPriceCents ?? null,
          expectedUnitPriceCents: l.expectedUnitPriceCents,
          lineTotalCents: l.item?.lineTotalCents ?? null,
        })),
        subtotalCents: priced.subtotalCents,
        taxCents: buildTaxBreakdownWithCharges(priced.items, charges).reduce((sum, t) => sum + t.taxCents, 0),
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
      },
    };
  } catch {
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Quote failed' };
  }
}
