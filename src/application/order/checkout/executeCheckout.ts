import { EMAIL_PATTERN } from '../../../domain/legal/impressum';
import { LEGAL_PACK_INCOMPLETE_ERROR, isLegalPackComplete } from '../../../domain/legal/legalReadiness';
import { legalOf } from '../../../domain/legal/legalTexts';
import { menuLanguagesOf, resolveMenuLanguage } from '../../../domain/menu/menuLanguage';
import { CheckoutSession } from '../../../domain/order/CheckoutSession';
import { orderableModesFor } from '../../../domain/order/fulfilment';
import {
  chargesTotalCents,
  cleanDeliveryAddress,
  deliveryFeeCharge,
  findDeliveryZone,
  hoursForMode,
} from '../../../domain/order/delivery';
import { applyDiscount } from '../../../domain/order/discount';
import { buildTaxBreakdownWithCharges } from '../../../domain/order/tax';
import { loyaltyOffer, normaliseCode } from '../../../domain/promotion/promotions';
import { isOpenForAsapOrder } from '../../../domain/order/openingHours';
import {
  ADDRESS_INVALID_ERROR,
  ADDRESS_REQUIRED_ERROR,
  BASKET_CHANGED_ERROR,
  DELIVERY_ADDRESS_INVALID_ERROR,
  DISCOUNT_ALREADY_USED_ERROR,
  DISCOUNT_CHANGED_ERROR,
  DISCOUNT_CODE_FORMAT_ERROR,
  DELIVERY_FEE_CHANGED_ERROR,
  DELIVERY_POSTCODE_NOT_SERVED_ERROR,
  EXPECTED_DISCOUNT_ERROR,
  EXPECTED_FEE_ERROR,
  IDEMPOTENCY_KEY_ERROR,
  LEGAL_CHANGED_ERROR,
  LOYALTY_OPT_IN_ERROR,
  MODE_NOT_OFFERED_ERROR,
  NO_PAYMENT_SETUP_ERROR,
  ORDER_LIMIT_REACHED_ERROR,
  PAYMENT_METHOD_ERROR,
  SCHEDULE_NOT_FOR_TABLES_ERROR,
  SCHEDULED_FOR_ERROR,
  SHOP_CLOSED_ERROR,
  SLOT_UNAVAILABLE_ERROR,
  TABLE_INVALID_ERROR,
} from '../../../domain/order/orderErrors';
import {
  addressRequired,
  chargedCents,
  CustomerAddress,
  DeliveryAddress,
  FULFILMENT_MODES,
  LegalRevisions,
  OrderDiscount,
  OrderTable,
  PaymentMethod,
} from '../../../domain/order/Order';
import { lastOrdersLeadMinutes } from '../../../domain/order/kitchenTiming';
import { isBookableSlot, parseSlotStart } from '../../../domain/order/scheduling';
import { periodKeyFor } from '../../../domain/usage/usagePeriod';
import { normaliseTableLabel } from '../../../domain/order/table';
import { generateAccessToken, IDEMPOTENCY_KEY_PATTERN, orderIdForIdempotencyKey } from '../../../domain/order/orderIds';
import { generateOrderRef } from '../../../domain/order/orderRef';
import { offeredPaymentMethods } from '../../../domain/order/paymentMethods';
import {
  findCheckoutSessionById,
  upsertCheckoutSession,
} from '../../../infrastructure/cosmos/order/CosmosCheckoutSessionRepository';
import { findPromotions } from '../../../infrastructure/cosmos/promotion/CosmosPromotionRepository';
import { findOrderById } from '../../../infrastructure/cosmos/order/CosmosOrderRepository';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { createPaymentIntent, isStripeIdempotencyError } from '../../../infrastructure/stripe/stripeClient';
import { ApplicationResult } from '../../_shared/types';
import { resolveDiscount } from '../../promotion/resolveDiscount';
import { loadOrderLimitStatus } from '../../usage/orderLimitStatus';
import { holdSlotPlace, releaseSlotPlace } from '../_shared/slotPlaces';
import { loadPricingContext } from '../_shared/loadPricingContext';
import { priceBasket, validateBasketItems } from '../_shared/priceBasket';
import { CheckoutRequestDto, CheckoutResultDto } from './dtos';

const MAX_NAME_CHARS = 200;
const MAX_NOTES_CHARS = 500;

const MAX_ADDRESS_FIELD_CHARS = 200;

/** The trimmed address, or null when it is not an object with four non-empty fields of at most 200 characters. */
function cleanAddress(value: unknown): CustomerAddress | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const field of ['street', 'postcode', 'city', 'country']) {
    const v = raw[field];
    if (typeof v !== 'string') return null;
    const trimmed = v.trim();
    if (trimmed === '' || trimmed.length > MAX_ADDRESS_FIELD_CHARS) return null;
    out[field] = trimmed;
  }
  return out as unknown as CustomerAddress;
}

function isWholeNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n);
}

export async function executeCheckout(
  request: CheckoutRequestDto,
  options: { now?: Date } = {},
): Promise<ApplicationResult<CheckoutResultDto>> {
  // --- Basic input validation ---
  if (!request.shopId || typeof request.shopId !== 'string') {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required' };
  }
  const itemsError = validateBasketItems(request.items);
  if (itemsError) return { ok: false, code: 'INVALID_INPUT', error: itemsError };

  if (!request.customerName || typeof request.customerName !== 'string') {
    return { ok: false, code: 'INVALID_INPUT', error: 'customerName is required' };
  }
  if (request.customerName.length > MAX_NAME_CHARS) {
    return { ok: false, code: 'INVALID_INPUT', error: `customerName must be at most ${MAX_NAME_CHARS} characters` };
  }
  if (!request.customerEmail || typeof request.customerEmail !== 'string') {
    return { ok: false, code: 'INVALID_INPUT', error: 'customerEmail is required' };
  }
  if (!EMAIL_PATTERN.test(request.customerEmail.trim())) {
    return { ok: false, code: 'INVALID_INPUT', error: 'customerEmail must be a valid email address' };
  }
  if (!request.customerPhone || typeof request.customerPhone !== 'string') {
    return { ok: false, code: 'INVALID_INPUT', error: 'customerPhone is required' };
  }
  if (request.customerNotes !== undefined && request.customerNotes !== null) {
    if (typeof request.customerNotes !== 'string' || request.customerNotes.length > MAX_NOTES_CHARS) {
      return { ok: false, code: 'INVALID_INPUT', error: `customerNotes must be at most ${MAX_NOTES_CHARS} characters` };
    }
  }
  if (request.paymentMethod !== undefined && request.paymentMethod !== 'card') {
    return { ok: false, code: 'INVALID_INPUT', error: PAYMENT_METHOD_ERROR };
  }
  const requestedRevisions = request.legalRevisions;
  if (
    requestedRevisions !== undefined &&
    (typeof requestedRevisions !== 'object' ||
      requestedRevisions === null ||
      !isWholeNumber(requestedRevisions.terms) ||
      !isWholeNumber(requestedRevisions.withdrawal))
  ) {
    return { ok: false, code: 'INVALID_INPUT', error: 'legalRevisions must have whole-number terms and withdrawal' };
  }
  const method: PaymentMethod = request.paymentMethod ?? 'card';
  if (typeof request.idempotencyKey !== 'string' || !IDEMPOTENCY_KEY_PATTERN.test(request.idempotencyKey)) {
    return { ok: false, code: 'INVALID_INPUT', error: IDEMPOTENCY_KEY_ERROR };
  }
  const idempotencyKey = request.idempotencyKey;
  let customerAddress: CustomerAddress | undefined;
  if (request.customerAddress !== undefined && request.customerAddress !== null) {
    const cleaned = cleanAddress(request.customerAddress);
    if (!cleaned) return { ok: false, code: 'INVALID_INPUT', error: ADDRESS_INVALID_ERROR };
    customerAddress = cleaned;
  }

  const mode = request.fulfilmentMode ?? 'collection';
  if (!FULFILMENT_MODES.includes(mode)) {
    return { ok: false, code: 'INVALID_INPUT', error: 'fulfilmentMode must be one of collection, delivery, dine_in' };
  }
  let table: OrderTable | undefined;
  if (mode === 'dine_in') {
    const label = normaliseTableLabel(request.table);
    if (!label) return { ok: false, code: 'INVALID_INPUT', error: TABLE_INVALID_ERROR };
    table = { label };
  }
  let deliveryAddress: DeliveryAddress | undefined;
  if (mode === 'delivery') {
    const cleaned = cleanDeliveryAddress(request.deliveryAddress);
    if (!cleaned) return { ok: false, code: 'INVALID_INPUT', error: DELIVERY_ADDRESS_INVALID_ERROR };
    deliveryAddress = cleaned;
  }
  const expectedFee = request.expectedDeliveryFeeCents;
  if (expectedFee !== undefined && (typeof expectedFee !== 'number' || !Number.isInteger(expectedFee) || expectedFee < 0)) {
    return { ok: false, code: 'INVALID_INPUT', error: EXPECTED_FEE_ERROR };
  }
  let discountCode: string | null = null;
  if (request.discountCode !== undefined && request.discountCode !== null && request.discountCode !== '') {
    discountCode = normaliseCode(request.discountCode);
    if (!discountCode) return { ok: false, code: 'INVALID_INPUT', error: DISCOUNT_CODE_FORMAT_ERROR };
  }
  const expectedDiscount = request.expectedDiscountCents;
  if (expectedDiscount !== undefined && (typeof expectedDiscount !== 'number' || !Number.isInteger(expectedDiscount) || expectedDiscount < 0)) {
    return { ok: false, code: 'INVALID_INPUT', error: EXPECTED_DISCOUNT_ERROR };
  }
  if (request.loyaltyOptIn !== undefined && typeof request.loyaltyOptIn !== 'boolean') {
    return { ok: false, code: 'INVALID_INPUT', error: LOYALTY_OPT_IN_ERROR };
  }
  let scheduledFor: Date | null = null;
  if (request.scheduledFor !== undefined && request.scheduledFor !== null) {
    scheduledFor = parseSlotStart(request.scheduledFor);
    if (!scheduledFor) return { ok: false, code: 'INVALID_INPUT', error: SCHEDULED_FOR_ERROR };
    if (mode === 'dine_in') return { ok: false, code: 'INVALID_INPUT', error: SCHEDULE_NOT_FOR_TABLES_ERROR };
  }

  try {
    const now = options.now ?? new Date();

    // --- Fetch and validate shop ---
    const shop = await findShopById(request.shopId);
    if (!shop || shop.isDeleted) {
      return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
    }
    if (shop.isPaused) {
      return {
        ok: false,
        code: 'INVALID_INPUT',
        error: shop.isPaused && shop.pausedMessage
          ? shop.pausedMessage
          : 'This shop is not currently accepting orders',
      };
    }
    if (!isLegalPackComplete(shop)) {
      return { ok: false, code: 'INVALID_INPUT', error: LEGAL_PACK_INCOMPLETE_ERROR };
    }

    // --- Payment method: what this restaurant offers decides, not what the request asks for ---
    const offered = offeredPaymentMethods(shop);
    if (offered.length === 0) {
      return { ok: false, code: 'INVALID_INPUT', error: NO_PAYMENT_SETUP_ERROR };
    }
    if (!offered.includes(method)) {
      return { ok: false, code: 'INVALID_INPUT', error: PAYMENT_METHOD_ERROR };
    }

    // --- A repeated submit (double click, retry) whose order already exists returns that order ---
    const sessionId = orderIdForIdempotencyKey(shop.id, idempotencyKey);
    const existing = await findOrderById(sessionId);
    if (existing) {
      return {
        ok: true,
        data: {
          kind: 'placed',
          orderId: existing.id,
          orderRef: existing.orderRef,
          accessToken: existing.customerAccessToken ?? '',
          subtotalCents: existing.subtotalCents,
          totalCents: chargedCents(existing),
          currency: existing.currency,
        },
      };
    }

    // --- After the repeat-submit short-cut, so a retry still finds its order even if dine-in was switched off since ---
    if (!orderableModesFor(shop).includes(mode)) {
      return { ok: false, code: 'INVALID_INPUT', error: MODE_NOT_OFFERED_ERROR };
    }

    // --- Also after the short-cut: orders already placed stay reachable, only new ones are refused ---
    if ((await loadOrderLimitStatus(shop, now)).limitReached) {
      return { ok: false, code: 'INVALID_INPUT', error: ORDER_LIMIT_REACHED_ERROR };
    }

    // --- The diner must have seen the terms that are in force now ---
    const legal = legalOf(shop);
    const current: LegalRevisions = {
      terms: legal.terms?.revision ?? 0,
      withdrawal: legal.withdrawal?.revision ?? 0,
    };
    if (
      requestedRevisions &&
      (requestedRevisions.terms !== current.terms || requestedRevisions.withdrawal !== current.withdrawal)
    ) {
      return { ok: false, code: 'CONFLICT', error: LEGAL_CHANGED_ERROR };
    }

    if (scheduledFor) {
      if (!isBookableSlot(shop, mode, scheduledFor, now)) return { ok: false, code: 'CONFLICT', error: SLOT_UNAVAILABLE_ERROR };
      // A slot in a later month may not pre-book past that month's limit.
      if (
        periodKeyFor(scheduledFor, shop.timezone) !== periodKeyFor(now, shop.timezone) &&
        (await loadOrderLimitStatus(shop, scheduledFor)).limitReached
      ) {
        return { ok: false, code: 'INVALID_INPUT', error: ORDER_LIMIT_REACHED_ERROR };
      }
    } else if (!isOpenForAsapOrder(hoursForMode(shop, mode), shop.closures, shop.timezone, now, lastOrdersLeadMinutes(shop, mode))) {
      return { ok: false, code: 'INVALID_INPUT', error: SHOP_CLOSED_ERROR };
    }
    const pricedAt = scheduledFor ?? now;

    const zone = deliveryAddress ? findDeliveryZone(shop, deliveryAddress.postcode) : null;
    if (deliveryAddress && !zone) return { ok: false, code: 'INVALID_INPUT', error: DELIVERY_POSTCODE_NOT_SERVED_ERROR };
    if (zone && expectedFee !== undefined && expectedFee !== zone.feeCents) {
      return { ok: false, code: 'CONFLICT', error: DELIVERY_FEE_CHANGED_ERROR };
    }

    // --- Resolve prices server-side (never trust client amounts) ---
    const context = await loadPricingContext(shop, request.items.map((i) => i.productId));
    const language = resolveMenuLanguage(request.language, menuLanguagesOf(shop));
    const priced = priceBasket({ items: request.items, ...context, shop, mode, now: pricedAt, language });
    if (!priced.allOk) {
      return { ok: false, code: 'CONFLICT', error: BASKET_CHANGED_ERROR };
    }
    let orderItems = priced.items;
    const subtotalCents = priced.subtotalCents;
    const fee = zone ? deliveryFeeCharge(shop, zone, context.refs, pricedAt) : null;
    const charges = fee ? [fee] : [];
    let totalCents = subtotalCents + chargesTotalCents(charges);
    let taxBreakdown = buildTaxBreakdownWithCharges(orderItems, charges);
    const minimum = zone ? zone.minOrderCents : shop.minOrderAmountCents;

    // --- Enforce minimum order amount (items only, the fee does not count towards it) ---
    if (subtotalCents < minimum) {
      const minDollars = (minimum / 100).toFixed(2);
      return {
        ok: false,
        code: 'INVALID_INPUT',
        error: `Order total is below the minimum of ${shop.currency} ${minDollars}`,
      };
    }

    // --- Discount: judged now (also for an order for later), taken off the dishes only; the fee is never discounted ---
    const promotions = discountCode || request.loyaltyOptIn === true ? await findPromotions(shop.id) : null;
    let discount: OrderDiscount | undefined;
    if (discountCode) {
      const resolved = await resolveDiscount({
        shop,
        promotions,
        code: discountCode,
        subtotalCents,
        chargesCents: chargesTotalCents(charges),
        emailLower: request.customerEmail.trim().toLowerCase(),
        now,
      });
      if (!resolved.ok) {
        return {
          ok: false,
          code: 'CONFLICT',
          error: resolved.problem === 'already_used' ? DISCOUNT_ALREADY_USED_ERROR : DISCOUNT_CHANGED_ERROR,
        };
      }
      if (expectedDiscount !== undefined && expectedDiscount !== resolved.offer.cents) {
        return { ok: false, code: 'CONFLICT', error: DISCOUNT_CHANGED_ERROR };
      }
      const applied = applyDiscount(orderItems, charges, resolved.offer);
      orderItems = applied.items;
      taxBreakdown = applied.taxBreakdown;
      totalCents = applied.totalCents;
      discount = applied.discount;
    } else if (expectedDiscount !== undefined && expectedDiscount !== 0) {
      return { ok: false, code: 'CONFLICT', error: DISCOUNT_CHANGED_ERROR };
    }
    const loyaltyOptIn = request.loyaltyOptIn === true && loyaltyOffer(promotions) !== null;

    if (addressRequired(totalCents) && !customerAddress) {
      return { ok: false, code: 'INVALID_INPUT', error: ADDRESS_REQUIRED_ERROR };
    }

    // --- An order for later holds its place last, so no other refusal leaves a hold behind ---
    if (scheduledFor && (await holdSlotPlace({ shop, orderId: sessionId, slot: scheduledFor, now })) === 'full') {
      return { ok: false, code: 'CONFLICT', error: SLOT_UNAVAILABLE_ERROR };
    }

    const at = now.toISOString();
    const connectAccountId = shop.stripe!.connectAccountId!;

    // --- Card: reserve the money on the restaurant's account. A repeated submit reuses its payment, ref and link. ---
    const prior = await findCheckoutSessionById(sessionId);
    const orderRef = prior?.orderRef ?? generateOrderRef();
    const accessToken = prior?.customerAccessToken ?? generateAccessToken();
    let paymentIntent: { id: string; clientSecret: string | null };
    try {
      paymentIntent = await createPaymentIntent({
        connectAccountId,
        amountCents: totalCents,
        currency: shop.currency,
        description: `${shop.name} ${orderRef}`,
        orderRef,
        sessionId,
        idempotencyKey: `checkout-${sessionId}`,
      });
    } catch (err: unknown) {
      // The card was never reserved, so the held place goes back at once.
      if (scheduledFor) await releaseSlotPlace({ shop, order: { id: sessionId, scheduledFor: scheduledFor.toISOString() }, now });
      // Same key, different payment details: the basket is no longer the one the first submit paid for.
      if (isStripeIdempotencyError(err)) return { ok: false, code: 'CONFLICT', error: BASKET_CHANGED_ERROR };
      throw err;
    }

    // --- Keep the checkout (no order exists until Stripe confirms the reservation). A declined card keeps it. ---
    const session: CheckoutSession = {
      id: sessionId,
      shopId: shop.id,
      stripePaymentIntentId: paymentIntent.id,
      items: orderItems,
      subtotalCents,
      totalCents,
      ...(charges.length > 0 ? { charges } : {}),
      ...(discount ? { discount } : {}),
      ...(loyaltyOptIn ? { loyaltyOptIn: true as const } : {}),
      currency: shop.currency,
      customerName: request.customerName,
      customerEmail: request.customerEmail.trim(),
      customerPhone: request.customerPhone,
      customerNotes: request.customerNotes,
      ...(customerAddress ? { customerAddress } : {}),
      ...(table ? { table } : {}),
      ...(scheduledFor ? { scheduledFor: scheduledFor.toISOString() } : {}),
      ...(deliveryAddress ? { deliveryAddress } : {}),
      fulfilmentMode: mode,
      taxBreakdown,
      language,
      legalRevisions: requestedRevisions ?? current,
      customerAccessToken: accessToken,
      idempotencyKey,
      orderRef,
      createdAt: prior?.createdAt ?? at,
      ttl: 3600,
    };
    await upsertCheckoutSession(session);

    return {
      ok: true,
      data: {
        kind: 'card',
        sessionId,
        orderId: sessionId,
        accessToken,
        clientSecret: paymentIntent.clientSecret!,
        subtotalCents,
        totalCents,
        currency: shop.currency,
        stripeConnectAccountId: connectAccountId,
      },
    };
  } catch (error: any) {
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Checkout failed' };
  }
}
