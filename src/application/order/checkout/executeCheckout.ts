import Stripe from 'stripe';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { findProductById } from '../../../infrastructure/cosmos/product/CosmosProductRepository';
import { createCheckoutSession } from '../../../infrastructure/cosmos/order/CosmosCheckoutSessionRepository';
import { CheckoutRequestDto, CheckoutResultDto } from './dtos';
import { ApplicationResult } from '../../_shared/types';
import { isProductScheduleActive } from '../../_shared/scheduleUtils';
import { FULFILMENT_MODES, OrderItem } from '../../../domain/order/Order';
import { CheckoutSession } from '../../../domain/order/CheckoutSession';

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  return new Stripe(key);
}

export async function executeCheckout(
  request: CheckoutRequestDto,
): Promise<ApplicationResult<CheckoutResultDto>> {
  // --- Basic input validation ---
  if (!request.shopId || typeof request.shopId !== 'string') {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required' };
  }

  if (!Array.isArray(request.items) || request.items.length === 0) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      error: 'items must be a non-empty array',
    };
  }

  for (let i = 0; i < request.items.length; i++) {
    const item = request.items[i];
    if (!item.productId || typeof item.productId !== 'string') {
      return {
        ok: false,
        code: 'INVALID_INPUT',
        error: `items[${i}].productId is required`,
      };
    }
    if (
      typeof item.quantity !== 'number' ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1
    ) {
      return {
        ok: false,
        code: 'INVALID_INPUT',
        error: `items[${i}].quantity must be a positive integer`,
      };
    }
  }

  if (!request.customerName || typeof request.customerName !== 'string') {
    return { ok: false, code: 'INVALID_INPUT', error: 'customerName is required' };
  }
  if (!request.customerEmail || typeof request.customerEmail !== 'string') {
    return { ok: false, code: 'INVALID_INPUT', error: 'customerEmail is required' };
  }
  if (!request.customerPhone || typeof request.customerPhone !== 'string') {
    return { ok: false, code: 'INVALID_INPUT', error: 'customerPhone is required' };
  }

  const mode = request.fulfilmentMode ?? 'collection';
  if (!FULFILMENT_MODES.includes(mode)) {
    return { ok: false, code: 'INVALID_INPUT', error: 'fulfilmentMode must be one of collection, delivery, dine_in' };
  }
  if (mode !== 'collection') {
    return { ok: false, code: 'INVALID_INPUT', error: 'Only collection orders are available at the moment' };
  }

  try {
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
    if (!shop.stripe?.connectAccountId || shop.stripe?.connectOnboardingStatus !== 'complete') {
      return {
        ok: false,
        code: 'INVALID_INPUT',
        error: 'This shop is not set up to accept payments yet',
      };
    }

    // --- Resolve prices server-side (never trust client amounts) ---
    const orderItems: OrderItem[] = [];
    let subtotalCents = 0;

    for (let i = 0; i < request.items.length; i++) {
      const item = request.items[i];

      const product = await findProductById(item.productId, request.shopId);
      if (!product || product.isDeleted) {
        return {
          ok: false,
          code: 'INVALID_INPUT',
          error: `Product not found: ${item.productId}`,
        };
      }
      if (!product.isAvailable) {
        return {
          ok: false,
          code: 'INVALID_INPUT',
          error: `Product is not available: ${product.name}`,
        };
      }
      if (product.schedule) {
        const scheduleActive = isProductScheduleActive(product.schedule, shop.timezone);
        if (!scheduleActive) {
          const from = product.schedule.startTime || '00:00';
          const to = product.schedule.endTime || '23:59';
          return {
            ok: false,
            code: 'INVALID_INPUT',
            error: `Product is not available at this time: ${product.name} (available ${from}–${to})`,
          };
        }
      }

      let unitPriceCents = product.price;
      let selectedVariantOptionName: string | undefined;
      const selectedAddonOptionNames: string[] = [];

      // Add selected variant priceDelta
      if (item.selectedVariantOptionId) {
        let found = false;
        outer: for (const vg of product.variantGroups ?? []) {
          for (const opt of vg.options) {
            if (opt.id === item.selectedVariantOptionId) {
              if (!opt.isAvailable) {
                return {
                  ok: false,
                  code: 'INVALID_INPUT',
                  error: `Variant option is not available: ${opt.name}`,
                };
              }
              unitPriceCents += opt.priceDelta;
              selectedVariantOptionName = opt.name;
              found = true;
              break outer;
            }
          }
        }
        if (!found) {
          return {
            ok: false,
            code: 'INVALID_INPUT',
            error: `Variant option not found: ${item.selectedVariantOptionId}`,
          };
        }
      }

      // Add selected addon priceDelta(s)
      for (const addonOptId of item.selectedAddonOptionIds ?? []) {
        let found = false;
        outer: for (const ag of product.addonGroups ?? []) {
          for (const opt of ag.options) {
            if (opt.id === addonOptId) {
              if (!opt.isAvailable) {
                return {
                  ok: false,
                  code: 'INVALID_INPUT',
                  error: `Addon option is not available: ${opt.name}`,
                };
              }
              unitPriceCents += opt.priceDelta;
              selectedAddonOptionNames.push(opt.name);
              found = true;
              break outer;
            }
          }
        }
        if (!found) {
          return {
            ok: false,
            code: 'INVALID_INPUT',
            error: `Addon option not found: ${addonOptId}`,
          };
        }
      }

      const lineTotalCents = unitPriceCents * item.quantity;
      subtotalCents += lineTotalCents;

      orderItems.push({
        productId: product.id,
        productName: product.name,
        quantity: item.quantity,
        unitPriceCents,
        selectedVariantOptionId: item.selectedVariantOptionId,
        selectedVariantOptionName,
        selectedAddonOptionIds: item.selectedAddonOptionIds,
        selectedAddonOptionNames: selectedAddonOptionNames.length > 0 ? selectedAddonOptionNames : undefined,
        lineTotalCents,
      });
    }

    // --- Enforce minimum order amount ---
    if (subtotalCents < shop.minOrderAmountCents) {
      const minDollars = (shop.minOrderAmountCents / 100).toFixed(2);
      return {
        ok: false,
        code: 'INVALID_INPUT',
        error: `Order total is below the minimum of ${shop.currency} ${minDollars}`,
      };
    }

    // --- Create Stripe PaymentIntent ---
    const sessionId = crypto.randomUUID();
    const stripe = getStripe();

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: subtotalCents,
        currency: shop.currency.toLowerCase(),
        metadata: { sessionId, shopId: shop.id },
      },
      { stripeAccount: shop.stripe!.connectAccountId! },
    );

    // --- Persist checkout session (no Order created until payment succeeds) ---
    const now = new Date().toISOString();
    const session: CheckoutSession = {
      id: sessionId,
      shopId: shop.id,
      stripePaymentIntentId: paymentIntent.id,
      items: orderItems,
      subtotalCents,
      currency: shop.currency,
      customerName: request.customerName,
      customerEmail: request.customerEmail,
      customerPhone: request.customerPhone,
      customerNotes: request.customerNotes,
      fulfilmentMode: mode,
      createdAt: now,
      ttl: 3600,
    };

    await createCheckoutSession(session);

    return {
      ok: true,
      data: {
        sessionId,
        clientSecret: paymentIntent.client_secret!,
        subtotalCents,
        currency: shop.currency,
        stripeConnectAccountId: shop.stripe!.connectAccountId!,
      },
    };
  } catch (error: any) {
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Checkout failed' };
  }
}
