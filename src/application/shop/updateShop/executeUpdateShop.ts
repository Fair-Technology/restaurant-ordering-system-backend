import { HttpRequest } from '@azure/functions';
import {
  findShopById,
  updateShop as updateShopInRepo,
} from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { findProductsByShopId } from '../../../infrastructure/cosmos/product/CosmosProductRepository';
import { findCategoriesByShopId } from '../../../infrastructure/cosmos/category/CosmosCategoryRepository';
import { checkShopPermission } from '../../_shared/permissions';
import { UpdateShopRequestDto, UpdateShopResultDto } from './dtos';
import { ApplicationResult } from '../../_shared/types';
import { getActorFromAuth, diffFields, logAudit } from '../../_shared/auditHelpers';
import { Shop } from '../../../domain/shop/Shop';

async function validateGoLiveCriteria(shop: Shop): Promise<string | null> {
  const addr = shop.address ?? {};
  if (shop.stripe?.connectOnboardingStatus !== 'complete') {
    return 'Stripe payments onboarding is not complete';
  }
  if (!shop.name?.trim()) {
    return 'Shop name is required';
  }
  if (
    !addr.street?.trim() ||
    !addr.city?.trim() ||
    !addr.state?.trim() ||
    !addr.postcode?.trim() ||
    !addr.country?.trim()
  ) {
    return 'Full shop address is required (street, city, state, postcode, country)';
  }
  if (!shop.branding?.logoUrl) {
    return 'Shop logo is required';
  }
  const hasOpeningHours = Object.values(shop.openingHours ?? {}).some(
    (slots) => Array.isArray(slots) && slots.length > 0,
  );
  if (!hasOpeningHours) {
    return 'Opening hours must be configured for at least one day';
  }
  const [products, categories] = await Promise.all([
    findProductsByShopId(shop.id),
    findCategoriesByShopId(shop.id),
  ]);
  if (!products.some((p) => p.isAvailable && !p.isDeleted)) {
    return 'At least one available product is required';
  }
  if (!categories.some((c) => !c.isDeleted)) {
    return 'At least one category is required';
  }
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
  if (!b.colors || typeof b.colors !== 'object') {
    return 'branding.colors is required and must be an object';
  }
  const hexRegex = /^#[0-9A-Fa-f]{6}$/;
  for (const field of ['primary', 'secondary', 'tertiary', 'background']) {
    if (typeof b.colors[field] !== 'string') {
      return `branding.colors.${field} is required`;
    }
    if (!hexRegex.test(b.colors[field])) {
      return `branding.colors.${field} must be a valid hex color (e.g. "#1D4ED8")`;
    }
  }
  return null;
}

export async function executeUpdateShop(
  request: UpdateShopRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<UpdateShopResultDto>> {
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

  try {
    const actor = await getActorFromAuth(httpRequest);
    const userId = actor.userId;

    const shop = await findShopById(request.shopId.trim());

    if (!shop) {
      return {
        ok: false,
        code: 'NOT_FOUND',
        error: 'Shop not found',
      };
    }

    const permError = checkShopPermission(shop, userId, 'manage_shop');
    if (permError) return permError;

    // Gate going live behind all criteria
    if (request.isPaused === false) {
      const criteriaError = await validateGoLiveCriteria(shop);
      if (criteriaError) {
        return { ok: false, code: 'INVALID_INPUT', error: criteriaError };
      }
    }

    // Update only provided fields
    const updatedShop = {
      ...shop,
      ...(request.isPaused !== undefined && { isPaused: request.isPaused }),
      ...(request.pausedMessage !== undefined && {
        pausedMessage: request.pausedMessage,
      }),
      ...(request.paymentPolicy !== undefined && {
        paymentPolicy: request.paymentPolicy,
      }),
      ...(request.minOrderAmountCents !== undefined && {
        minOrderAmountCents: request.minOrderAmountCents,
      }),
      ...(request.address !== undefined && {
        address: { ...shop.address, ...request.address },
      }),
      ...(request.branding !== undefined && { branding: request.branding }),
      ...(request.openingHours !== undefined && { openingHours: request.openingHours }),
      updatedAt: new Date().toISOString(),
    };

    const result = await updateShopInRepo(updatedShop);

    const changes = diffFields(
      shop as unknown as Record<string, unknown>,
      updatedShop as unknown as Record<string, unknown>,
      ['isPaused', 'pausedMessage', 'minOrderAmountCents', 'currency', 'timezone'],
      ['openingHours', 'branding', 'address'],
    );
    await logAudit({
      shopId: result.id,
      actorType: 'owner',
      actorId: actor.userId,
      action: 'shop.update',
      entityType: 'shop',
      entityId: result.id,
      entityName: result.name,
      changes,
    });

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
    return {
      ok: false,
      code: 'INTERNAL_ERROR',
      error: 'Failed to update shop',
    };
  }
}
