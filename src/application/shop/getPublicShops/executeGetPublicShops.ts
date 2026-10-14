import { Shop, isShopOffline } from '../../../domain/shop/Shop';
import { findAllShops } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { ApplicationResult } from '../../_shared/types';
import { GetPublicShopsResultDto, PublicShopSummaryDto } from './dtos';

/** Public fields only. Every field is picked by name so nothing private can leak through a spread. */
export function toPublicShopSummary(shop: Shop): PublicShopSummaryDto {
  const b = shop.branding;
  return {
    id: shop.id,
    slug: shop.slug,
    name: shop.name,
    address: {
      city: shop.address?.city?.trim() || null,
      postcode: shop.address?.postcode?.trim() || null,
    },
    branding: b
      ? { logoUrl: b.logoUrl ?? null, heroImageUrl: b.heroImageUrl ?? null, accentColor: b.accentColor ?? null, showHero: b.showHero !== false }
      : null,
    openingHours: shop.openingHours ?? {},
    timezone: shop.timezone,
    ordersPaused: shop.ordersPaused === true,
  };
}

/** The diner home page's restaurant list: every shop that is not deleted and not offline (owner or platform). */
export async function executeGetPublicShops(): Promise<ApplicationResult<GetPublicShopsResultDto>> {
  try {
    const shops = (await findAllShops())
      .filter((shop) => shop.isDeleted !== true && !isShopOffline(shop))
      .map(toPublicShopSummary)
      .sort((a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }));
    return { ok: true, data: { shops } };
  } catch {
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to retrieve shops' };
  }
}
