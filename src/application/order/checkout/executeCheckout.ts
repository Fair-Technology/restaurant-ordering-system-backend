import { EMAIL_PATTERN } from '../../../domain/legal/impressum';
import { LEGAL_PACK_INCOMPLETE_ERROR, isLegalPackComplete } from '../../../domain/legal/legalReadiness';
import { legalOf } from '../../../domain/legal/legalTexts';
import { menuLanguagesOf, resolveMenuLanguage } from '../../../domain/menu/menuLanguage';
import { CheckoutSession } from '../../../domain/order/CheckoutSession';
import { ORDER_MODE_UNAVAILABLE_ERROR, ORDERABLE_MODES, orderableModesFor } from '../../../domain/order/fulfilment';
import { isOpenForAsapOrder } from '../../../domain/order/openingHours';
import {
  ADDRESS_INVALID_ERROR,
  ADDRESS_REQUIRED_ERROR,
  BASKET_CHANGED_ERROR,
  IDEMPOTENCY_KEY_ERROR,
  LEGAL_CHANGED_ERROR,
  MODE_NOT_OFFERED_ERROR,
  NO_PAYMENT_SETUP_ERROR,
  PAYMENT_METHOD_ERROR,
  SHOP_CLOSED_ERROR,
  TABLE_INVALID_ERROR,
} from '../../../domain/order/orderErrors';
import {
  addressRequired,
  CustomerAddress,
  DEFAULT_PREP_MINUTES,
  FULFILMENT_MODES,
  LegalRevisions,
  OrderTable,
  PaymentMethod,
} from '../../../domain/order/Order';
import { normaliseTableLabel } from '../../../domain/order/table';
import { generateAccessToken, IDEMPOTENCY_KEY_PATTERN, orderIdForIdempotencyKey } from '../../../domain/order/orderIds';
import { generateOrderRef } from '../../../domain/order/orderRef';
import { offeredPaymentMethods } from '../../../domain/order/paymentMethods';
import {
  findCheckoutSessionById,
  upsertCheckoutSession,
} from '../../../infrastructure/cosmos/order/CosmosCheckoutSessionRepository';
import { findOrderById } from '../../../infrastructure/cosmos/order/CosmosOrderRepository';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { createPaymentIntent, isStripeIdempotencyError } from '../../../infrastructure/stripe/stripeClient';
import { ApplicationResult } from '../../_shared/types';
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
  if (!ORDERABLE_MODES.includes(mode)) {
    return { ok: false, code: 'INVALID_INPUT', error: ORDER_MODE_UNAVAILABLE_ERROR };
  }
  let table: OrderTable | undefined;
  if (mode === 'dine_in') {
    const label = normaliseTableLabel(request.table);
    if (!label) return { ok: false, code: 'INVALID_INPUT', error: TABLE_INVALID_ERROR };
    table = { label };
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
          currency: existing.currency,
        },
      };
    }

    // --- After the repeat-submit short-cut, so a retry still finds its order even if dine-in was switched off since ---
    if (!orderableModesFor(shop).includes(mode)) {
      return { ok: false, code: 'INVALID_INPUT', error: MODE_NOT_OFFERED_ERROR };
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

    if (!isOpenForAsapOrder(shop.openingHours, shop.closures, shop.timezone, now, DEFAULT_PREP_MINUTES[mode])) {
      return { ok: false, code: 'INVALID_INPUT', error: SHOP_CLOSED_ERROR };
    }

    // --- Resolve prices server-side (never trust client amounts) ---
    const context = await loadPricingContext(shop, request.items.map((i) => i.productId));
    const language = resolveMenuLanguage(request.language, menuLanguagesOf(shop));
    const priced = priceBasket({ items: request.items, ...context, shop, mode, now, language });
    if (!priced.allOk) {
      return { ok: false, code: 'CONFLICT', error: BASKET_CHANGED_ERROR };
    }
    const { items: orderItems, subtotalCents, taxBreakdown } = priced;

    // --- Enforce minimum order amount ---
    if (subtotalCents < shop.minOrderAmountCents) {
      const minDollars = (shop.minOrderAmountCents / 100).toFixed(2);
      return {
        ok: false,
        code: 'INVALID_INPUT',
        error: `Order total is below the minimum of ${shop.currency} ${minDollars}`,
      };
    }

    if (addressRequired(subtotalCents) && !customerAddress) {
      return { ok: false, code: 'INVALID_INPUT', error: ADDRESS_REQUIRED_ERROR };
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
        amountCents: subtotalCents,
        currency: shop.currency,
        description: `${shop.name} ${orderRef}`,
        orderRef,
        sessionId,
        idempotencyKey: `checkout-${sessionId}`,
      });
    } catch (err: unknown) {
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
      currency: shop.currency,
      customerName: request.customerName,
      customerEmail: request.customerEmail.trim(),
      customerPhone: request.customerPhone,
      customerNotes: request.customerNotes,
      ...(customerAddress ? { customerAddress } : {}),
      ...(table ? { table } : {}),
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
        currency: shop.currency,
        stripeConnectAccountId: connectAccountId,
      },
    };
  } catch (error: any) {
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Checkout failed' };
  }
}
