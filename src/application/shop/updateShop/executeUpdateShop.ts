import { HttpRequest } from '@azure/functions';
import {
  findShopById,
  updateShop as updateShopInRepo,
} from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { findProductsByShopId } from '../../../infrastructure/cosmos/product/CosmosProductRepository';
import { findCategoriesByShopId } from '../../../infrastructure/cosmos/category/CosmosCategoryRepository';
import { authorizeShopAction, toAuditActor } from '../../_shared/shopAccess';
import { UpdateShopRequestDto, UpdateShopResultDto } from './dtos';
import { ApplicationResult } from '../../_shared/types';
import { diffFields, logAudit } from '../../_shared/auditHelpers';
import { ORDERS_PAUSED_MESSAGE_MAX_LENGTH, Shop, stripeReady } from '../../../domain/shop/Shop';
import { validateClosures } from '../../../domain/shop/closures';
import { ORDERS_PAUSE_DURATIONS, ordersPauseEndAt } from '../../../domain/shop/ordersPause';
import { resetMissedOrderStreak } from '../../order/_shared/missedOrders';
import { validateAccentColor } from '../../_shared/contrast';
import { GO_LIVE_STRIPE_ERROR, GO_LIVE_TAX_ID_ERROR } from '../../../domain/order/orderErrors';
import { menuLanguagesOf, validateMenuLanguagesChange } from '../../../domain/menu/menuLanguage';
import { MenuLanguage } from '../../../domain/reference/ReferenceLists';
import { addressFieldsChanged, isShopAddressComplete } from '../../../domain/shop/addressReadiness';
import { countryRequiresState, isKnownState } from '../../../domain/reference/subdivisions';
import { isOnMenu } from '../../../domain/product/Product';
import { LEGAL_GO_LIVE_ERRORS, legalCriteria } from '../../../domain/legal/legalReadiness';
import { hasInvoiceTaxId } from '../../../domain/legal/legalTexts';
import { getPlatformLegalIdentity } from '../../../infrastructure/cosmos/system/CosmosPlatformLegalIdentityRepository';
import { logServiceFailure } from '../../_shared/logServiceFailure';

const LEGAL_GO_LIVE_CODES: Record<keyof typeof LEGAL_GO_LIVE_ERRORS, string> = {
  dpa_accepted: 'GO_LIVE_DPA_REQUIRED',
  impressum: 'GO_LIVE_IMPRESSUM_REQUIRED',
  terms: 'GO_LIVE_TERMS_REQUIRED',
  withdrawal: 'GO_LIVE_WITHDRAWAL_REQUIRED',
  privacy_notice: 'GO_LIVE_PRIVACY_NOTICE_UNAVAILABLE',
};

async function validateGoLiveCriteria(shop: Shop): Promise<{ error: string; errorCode: string } | null> {
  const fail = (error: string, errorCode: string) => ({ error, errorCode });
  if (!stripeReady(shop)) {
    return fail(GO_LIVE_STRIPE_ERROR, 'GO_LIVE_STRIPE_REQUIRED');
  }
  if (!shop.name?.trim()) {
    return fail('Shop name is required', 'GO_LIVE_NAME_REQUIRED');
  }
  if (!isShopAddressComplete(shop.address, shop.countryCode)) {
    return fail(
      countryRequiresState(shop.countryCode)
        ? 'Full shop address is required (street, city, state, postcode, country)'
        : 'Full shop address is required (street, city, postcode, country)',
      'GO_LIVE_ADDRESS_REQUIRED',
    );
  }
  const hasOpeningHours = Object.values(shop.openingHours ?? {}).some(
    (slots) => Array.isArray(slots) && slots.length > 0,
  );
  if (!hasOpeningHours || shop.openingHoursConfirmed === false) {
    return fail('Opening hours must be configured for at least one day', 'GO_LIVE_OPENING_HOURS_REQUIRED');
  }
  const [products, categories] = await Promise.all([
    findProductsByShopId(shop.id),
    findCategoriesByShopId(shop.id),
  ]);
  if (!products.some((p) => isOnMenu(p))) {
    return fail('At least one dish with declared allergens and additives is required', 'GO_LIVE_DISH_REQUIRED');
  }
  if (!categories.some((c) => !c.isDeleted)) {
    return fail('At least one category is required', 'GO_LIVE_CATEGORY_REQUIRED');
  }
  const identity = await getPlatformLegalIdentity();
  const unmetLegal = legalCriteria(shop, identity).find((c) => !c.met);
  if (unmetLegal) return fail(LEGAL_GO_LIVE_ERRORS[unmetLegal.key], LEGAL_GO_LIVE_CODES[unmetLegal.key]);
  // Every order gets an invoice, and an invoice needs the seller's VAT ID or tax number.
  if (!hasInvoiceTaxId(shop)) return fail(GO_LIVE_TAX_ID_ERROR, 'GO_LIVE_TAX_ID_REQUIRED');
  return null;
}

const TIME_PATTERN = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
const VALID_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

function validateOpeningHours(openingHours: unknown): string | null {
  if (typeof openingHours !== 'object' || openingHours === null || Array.isArray(openingHours)) {
    return 'openingHours must be an object';
  }
  const oh = openingHours as Record<string, unknown>;
  let hasOpenDay = false;
  for (const day of VALID_DAYS) {
    const slots = oh[day];
    if (slots === undefined || slots === null) continue;
    if (!Array.isArray(slots)) return `openingHours.${day} must be an array`;
    for (const slot of slots) {
      if (!slot || typeof slot !== 'object' || Array.isArray(slot)) {
        return `openingHours.${day} contains an invalid time slot`;
      }
      const s = slot as Record<string, unknown>;
      if (typeof s.open !== 'string' || !TIME_PATTERN.test(s.open)) {
        return `openingHours.${day} has invalid open time — expected HH:mm`;
      }
      if (typeof s.close !== 'string' || !TIME_PATTERN.test(s.close)) {
        return `openingHours.${day} has invalid close time — expected HH:mm`;
      }
      // would read as 24 hours
      if (s.open === s.close && s.open !== '00:00') {
        return `openingHours.${day} has equal open and close times — use 00:00–00:00 for open all day`;
      }
    }
    if (slots.length > 0) hasOpenDay = true;
  }
  if (!hasOpenDay) return 'At least one day must have opening hours';
  return null;
}

function validateBranding(branding: unknown): string | null {
  if (branding === null || branding === undefined) return null;
  if (typeof branding !== 'object' || Array.isArray(branding)) {
    return 'branding must be an object or null';
  }
  const b = branding as any;
  if (b.logoUrl !== null && b.logoUrl !== undefined) {
    if (typeof b.logoUrl !== 'string' || !b.logoUrl.startsWith('https://')) {
      return 'branding.logoUrl must be a valid https URL or null';
    }
  }
  if (b.heroImageUrl !== null && b.heroImageUrl !== undefined) {
    if (typeof b.heroImageUrl !== 'string' || !b.heroImageUrl.startsWith('https://')) {
      return 'branding.heroImageUrl must be a valid https URL or null';
    }
  }
  if (b.showHero !== undefined && typeof b.showHero !== 'boolean') {
    return 'branding.showHero must be a boolean';
  }
  const accentError = validateAccentColor(b.accentColor);
  if (accentError) return accentError;
  return null;
}

function validateAddressChange(
  current: Shop['address'] | undefined,
  incoming: NonNullable<UpdateShopRequestDto['address']>,
  countryCode: string,
): string | null {
  const norm = (v: string | undefined) => (v ?? '').trim();
  if (incoming.country !== undefined && norm(incoming.country) !== norm(current?.country)) {
    return 'address.country cannot be changed; it was fixed when the shop registered';
  }
  if (incoming.state !== undefined) {
    const nextState = norm(incoming.state);
    const prevState = norm(current?.state);
    if (
      nextState !== '' &&
      nextState !== prevState &&
      countryRequiresState(countryCode) &&
      !isKnownState(nextState, countryCode)
    ) {
      return `address.state must be one of ${countryCode}'s known states/regions`;
    }
  }
  return null;
}

export async function executeUpdateShop(
  request: UpdateShopRequestDto,
  httpRequest: HttpRequest,
  options: { now?: Date } = {},
): Promise<ApplicationResult<UpdateShopResultDto>> {
  const now = options.now ?? new Date();
  // Validate input
  if (
    !request.shopId ||
    typeof request.shopId !== 'string' ||
    request.shopId.trim() === ''
  ) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      error: 'shopId is required and must be a non-empty string',
    };
  }

  if (request.ordersPaused !== undefined && typeof request.ordersPaused !== 'boolean') {
    return { ok: false, code: 'INVALID_INPUT', error: 'ordersPaused must be a boolean' };
  }
  if (request.ordersPausedFor !== undefined) {
    if (!(ORDERS_PAUSE_DURATIONS as readonly unknown[]).includes(request.ordersPausedFor)) {
      return { ok: false, code: 'INVALID_INPUT', error: 'ordersPausedFor must be one of minutes_30, rest_of_day, until_switched_back' };
    }
    if (request.ordersPaused !== true) {
      return { ok: false, code: 'INVALID_INPUT', error: 'ordersPausedFor needs ordersPaused: true' };
    }
  }
  let ordersPausedMessage: string | undefined;
  if (request.ordersPausedMessage !== undefined) {
    if (typeof request.ordersPausedMessage !== 'string') {
      return { ok: false, code: 'INVALID_INPUT', error: 'ordersPausedMessage must be a string' };
    }
    ordersPausedMessage = request.ordersPausedMessage.trim() || undefined;
    if (ordersPausedMessage && ordersPausedMessage.length > ORDERS_PAUSED_MESSAGE_MAX_LENGTH) {
      return {
        ok: false,
        code: 'INVALID_INPUT',
        error: `ordersPausedMessage must be at most ${ORDERS_PAUSED_MESSAGE_MAX_LENGTH} characters`,
      };
    }
  }

  if (request.branding !== undefined) {
    const brandingError = validateBranding(request.branding);
    if (brandingError) {
      return { ok: false, code: 'INVALID_INPUT', error: brandingError };
    }
  }

  if (request.openingHours !== undefined) {
    const hoursError = validateOpeningHours(request.openingHours);
    if (hoursError) {
      return { ok: false, code: 'INVALID_INPUT', error: hoursError };
    }
  }

  let nextClosures: Shop['closures'] = [];
  if (request.closures !== undefined) {
    const closures = validateClosures(request.closures, now);
    if (!closures.ok) {
      return { ok: false, code: 'INVALID_INPUT', error: closures.error };
    }
    nextClosures = closures.value;
  }

  try {
    const shop = await findShopById(request.shopId.trim());

    if (!shop) {
      return {
        ok: false,
        code: 'NOT_FOUND',
        error: 'Shop not found',
      };
    }

    const access = await authorizeShopAction(httpRequest, shop, 'manage_shop', { allowSuperadmin: true });
    if (!access.ok) return access;

    let nextAddress: Shop['address'] | undefined;
    if (request.address !== undefined) {
      const addrError = validateAddressChange(shop.address, request.address, shop.countryCode);
      if (addrError) {
        return { ok: false, code: 'INVALID_INPUT', error: addrError };
      }
      const merged = { ...shop.address, ...request.address };
      const changed = addressFieldsChanged(shop.address, merged);
      const isSuperadmin = access.actor.actorType === 'superadmin';
      const locked = isShopAddressComplete(shop.address, shop.countryCode);
      if (changed && locked && !isSuperadmin) {
        return {
          ok: false,
          code: 'SHOP_ADDRESS_LOCKED',
          error: 'The shop address is locked after first entry. Contact platform support to change it.',
          errorCode: 'SHOP_ADDRESS_LOCKED',
          field: 'address',
        };
      }
      if (changed && isSuperadmin && !isShopAddressComplete(merged, shop.countryCode)) {
        return {
          ok: false,
          code: 'INVALID_INPUT',
          error: 'A superadmin address change must leave the address complete.',
          errorCode: 'SHOP_ADDRESS_INCOMPLETE',
          field: 'address',
        };
      }
      nextAddress = merged;
    }

    let nextLanguages: MenuLanguage[] | undefined;
    if (request.menuLanguages !== undefined) {
      const r = validateMenuLanguagesChange(menuLanguagesOf(shop), request.menuLanguages);
      if (typeof r === 'string') {
        return { ok: false, code: 'INVALID_INPUT', error: r };
      }
      nextLanguages = r;
    }

    // The platform took this shop offline: the owner cannot switch it back on.
    if (request.isPaused === false && shop.offlineBySuperadmin === true) {
      return {
        ok: false,
        code: 'SHOP_OFFLINE_BY_SUPERADMIN',
        error: 'The platform has taken this shop offline. Please contact support.',
        errorCode: 'SHOP_OFFLINE_BY_SUPERADMIN',
      };
    }

    // Gate going live behind all criteria — only when actually switching on.
    // A shop that is already live re-sends isPaused: false on every status save;
    // re-checking then would block the save (e.g. after a new DPA version) while
    // the shop stays online anyway.
    if (request.isPaused === false && shop.isPaused !== false) {
      const criteriaError = await validateGoLiveCriteria(shop);
      if (criteriaError) {
        return { ok: false, code: 'INVALID_INPUT', error: criteriaError.error, errorCode: criteriaError.errorCode };
      }
    }

    // Update only provided fields
    const updatedShop = {
      ...shop,
      ...(request.isPaused !== undefined && { isPaused: request.isPaused }),
      ...(request.pausedMessage !== undefined && {
        pausedMessage: request.pausedMessage,
      }),
      ...(request.ordersPaused !== undefined && {
        ordersPaused: request.ordersPaused,
        ordersPausedUntil: request.ordersPaused
          ? ordersPauseEndAt(request.ordersPausedFor ?? 'until_switched_back', shop.timezone, now)
          : null,
        ordersAutoPaused: null,
      }),
      ...(request.ordersPausedMessage !== undefined && { ordersPausedMessage }),
      ...(request.minOrderAmountCents !== undefined && {
        minOrderAmountCents: request.minOrderAmountCents,
      }),
      ...(nextAddress !== undefined && { address: nextAddress }),
      ...(request.branding !== undefined && { branding: request.branding }),
      ...(request.openingHours !== undefined && {
        openingHours: request.openingHours,
        // Any save of the Opening hours section confirms them, even if unchanged.
        openingHoursConfirmed: true,
      }),
      ...(request.closures !== undefined && { closures: nextClosures }),
      ...(nextLanguages && { menuLanguages: nextLanguages }),
      updatedAt: now.toISOString(),
    };

    const result = await updateShopInRepo(updatedShop);

    const changes = diffFields(
      shop as unknown as Record<string, unknown>,
      updatedShop as unknown as Record<string, unknown>,
      ['isPaused', 'pausedMessage', 'ordersPaused', 'ordersPausedUntil', 'ordersPausedMessage', 'minOrderAmountCents', 'currency', 'timezone'],
      ['openingHours', 'branding', 'menuLanguages'],
    );
    if (nextAddress !== undefined) {
      const before = JSON.stringify(shop.address ?? {});
      const after = JSON.stringify(updatedShop.address ?? {});
      if (before !== after) changes.push({ field: 'address', from: before, to: after });
    }
    if (request.closures !== undefined) {
      const before = shop.closures ?? [];
      const added = nextClosures.filter((c) => !before.some((b) => b.id === c.id));
      const removed = before.filter((b) => !nextClosures.some((c) => c.id === b.id));
      if (added.length > 0 || removed.length > 0) {
        changes.push({ field: 'closures', from: `${before.length} closure(s)`, to: `${nextClosures.length} closure(s)` });
        for (const c of added) {
          changes.push({ field: 'closures.added', from: null, to: `${c.start}–${c.end}${c.reason ? ` (${c.reason})` : ''}` });
        }
        for (const c of removed) changes.push({ field: 'closures.removed', from: `${c.start}–${c.end}`, to: null });
      }
    }
    // Switching the banner on or off is its own readable line, besides the generic branding entry.
    const heroBefore = shop.branding?.showHero !== false;
    const heroAfter = updatedShop.branding?.showHero !== false;
    if (heroBefore !== heroAfter) changes.push({ field: 'branding.showHero', from: heroBefore, to: heroAfter });
    // The owner's online/offline switch sends only isPaused; give it its own key so the Activity feed can tell it from a settings save.
    const PAUSE_FIELDS = ['ordersPaused', 'ordersPausedUntil', 'ordersPausedMessage'];
    const action = changes.some((c) => c.field === 'isPaused')
      ? 'shop.online_toggle'
      : changes.length > 0 && changes.every((c) => PAUSE_FIELDS.includes(c.field))
        ? 'shop.orders_pause_toggle'
        : changes.length > 0 && changes.every((c) => c.field.startsWith('closures'))
          ? 'shop.closures_update'
          : changes.length > 0 && changes.every((c) => c.field === 'address') && access.actor.actorType === 'superadmin'
            ? 'shop.address_override_by_superadmin'
            : 'shop.update';
    await logAudit({
      shopId: result.id,
      ...toAuditActor(access.actor),
      action,
      entityType: 'shop',
      entityId: result.id,
      entityName: result.name,
      changes,
    });
    // The owner acted on the pause (on or off), so the missed-order count starts again.
    if (request.ordersPaused !== undefined) await resetMissedOrderStreak(shop.id, now);

    const resultDto: UpdateShopResultDto = {
      id: result.id,
      slug: result.slug,
      name: result.name,
      isDeleted: result.isDeleted,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
    };

    return {
      ok: true,
      data: resultDto,
    };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    logServiceFailure('updateShop', error);
    return {
      ok: false,
      code: 'INTERNAL_ERROR',
      error: 'Failed to update shop',
    };
  }
}
