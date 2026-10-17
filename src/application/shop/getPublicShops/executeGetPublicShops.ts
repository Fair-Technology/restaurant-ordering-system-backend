import { isOrdersPausedAt } from '../../../domain/shop/ordersPause';
import { Shop, isShopOffline } from '../../../domain/shop/Shop';
import { findAllShops } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { ApplicationResult } from '../../_shared/types';
import { GetPublicShopsResultDto, PublicShopSummaryDto } from './dtos';

/** Public fields only. Every field is picked by name so nothing private can leak through a spread. */
export function toPublicShopSummary(shop: Shop, now: Date): PublicShopSummaryDto {
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
    ordersPaused: isOrdersPausedAt(shop, now),
  };
}

/** The diner home page's restaurant list: every shop that is not deleted and not offline (owner or platform). */
export async function executeGetPublicShops(options: { now?: Date } = {}): Promise<ApplicationResult<GetPublicShopsResultDto>> {
  try {
    const now = options.now ?? new Date();
    const shops = (await findAllShops())
      .filter((shop) => shop.isDeleted !== true && !isShopOffline(shop))
      .map((s) => toPublicShopSummary(s, now))
      .sort((a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }));
    return { ok: true, data: { shops } };
  } catch {
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to retrieve shops' };
  }
}
