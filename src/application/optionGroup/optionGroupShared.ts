import { HttpRequest } from '@azure/functions';
import { Shop } from '../../domain/shop/Shop';
import { ShopOptionGroup, ShopOptionGroupOption } from '../../domain/optionGroup/ShopOptionGroup';
import { TranslationMap } from '../../domain/menu/menuLanguage';
import { findShopById } from '../../infrastructure/cosmos/shop/CosmosShopRepository';
import { authorizeShopAction, ShopAccess } from '../_shared/shopAccess';
import { ApplicationError } from '../_shared/types';

/** The library group as the admin sees it. */
export interface ShopOptionGroupDto {
  id: string;
  shopId: string;
  kind: 'variant' | 'addon';
  name: string;
  nameTranslations: TranslationMap;
  minSelectable: number;
  maxSelectable: number;
  options: ShopOptionGroupOption[];
  createdAt: string;
  updatedAt: string;
}

/** One option as sent on create/update. A missing id means a new option. */
export interface ShopOptionGroupOptionInputDto {
  id?: string;
  name: string;
  nameTranslations?: TranslationMap;
  priceDelta: number;
  isAvailable?: boolean;
  allergenIds?: string[];
  additiveIds?: string[];
  category?: string | null;
}

export function toShopOptionGroupDto(group: ShopOptionGroup): ShopOptionGroupDto {
  return {
    id: group.id,
    shopId: group.shopId,
    kind: group.kind,
    name: group.name,
    nameTranslations: group.nameTranslations ?? {},
    minSelectable: group.minSelectable,
    maxSelectable: group.maxSelectable,
    options: group.options.map((o) => ({
      ...o,
      nameTranslations: o.nameTranslations ?? {},
      allergenIds: o.allergenIds ?? [],
      additiveIds: o.additiveIds ?? [],
    })),
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
  };
}

export function requireId(value: unknown, field: string): ApplicationError | null {
  if (typeof value !== 'string' || value.trim() === '') {
    return { ok: false, code: 'INVALID_INPUT', error: `${field} is required and must be a non-empty string` };
  }
  return null;
}

/** Loads the shop (404 if missing or deleted) and checks the caller may manage its menu. */
export async function authorizeMenuShop(
  shopId: string,
  httpRequest: HttpRequest,
): Promise<{ ok: true; shop: Shop; access: ShopAccess } | ApplicationError> {
  const shop = await findShopById(shopId);
  if (!shop || shop.isDeleted) {
    return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
  }
  const access = await authorizeShopAction(httpRequest, shop, 'manage_menu');
  if (!access.ok) return access;
  return { ok: true, shop, access };
}

export function knownReferenceIds(refs: { allergens: { id: string }[]; additives: { id: string }[] }) {
  return {
    allergens: new Set(refs.allergens.map((a) => a.id)),
    additives: new Set(refs.additives.map((a) => a.id)),
  };
}
