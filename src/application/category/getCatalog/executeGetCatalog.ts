import { findCategoriesByShopId } from '../../../infrastructure/cosmos/category/CosmosCategoryRepository';
import { findProductsByShopId } from '../../../infrastructure/cosmos/product/CosmosProductRepository';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { ProductSchedule } from '../../../domain/product/Product';
import { ApplicationResult } from '../../_shared/types';
import { CatalogCategoryDto, CatalogProductDto, GetCatalogResultDto } from './dtos';

interface GetCatalogRequestDto {
  shopId: string;
}

export async function executeGetCatalog(
  request: GetCatalogRequestDto,
): Promise<ApplicationResult<GetCatalogResultDto>> {
  if (!request.shopId || typeof request.shopId !== 'string' || request.shopId.trim() === '') {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      error: 'shopId is required and must be a non-empty string',
    };
  }

  try {
    const shopId = request.shopId.trim();

    const [shop, categories, products] = await Promise.all([
      findShopById(shopId),
      findCategoriesByShopId(shopId),
      findProductsByShopId(shopId),
    ]);

    if (!shop) {
      return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
    }

    if (shop.isPaused) {
      return {
        ok: false,
        code: 'FORBIDDEN',
        error: shop.pausedMessage ?? 'This shop is currently paused',
      };
    }

    const now = new Date();
    const visibleProducts = products.filter(
      (p) => p.isAvailable && isWithinSchedule(p.schedule ?? null, shop.timezone, now),
    );

    const catalogCategories: CatalogCategoryDto[] = categories.map((category) => {
      const categoryProducts: CatalogProductDto[] = visibleProducts
        .filter((product) => product.categoryIds.includes(category.id))
        .map((product) => ({
          id: product.id,
          name: product.name,
          description: product.description,
          price: product.price,
          offerPrice: product.schedule?.offerPrice ?? null,
          offerLabel: product.schedule?.offerLabel ?? null,
          images: (product.images ?? []).map((img) => ({
            id: img.id,
            url: img.url,
            alt: img.alt,
            sortOrder: img.sortOrder ?? 0,
          })),
          variants: product.variantGroups ?? [],
          addons: product.addonGroups ?? [],
          isAvailable: product.isAvailable,
          createdAt: product.createdAt,
          updatedAt: product.updatedAt,
        }));

      return {
        id: category.id,
        name: category.name,
        sortOrder: category.sortOrder,
        icon: category.icon ?? undefined,
        products: categoryProducts,
      };
    });

    return {
      ok: true,
      data: { categories: catalogCategories },
    };
  } catch {
    return {
      ok: false,
      code: 'INTERNAL_ERROR',
      error: 'Failed to retrieve catalog',
    };
  }
}

function isWithinSchedule(
  schedule: ProductSchedule | null | undefined,
  timezone: string,
  now: Date,
): boolean {
  if (!schedule) return true; // no schedule = always available

  // Resolve current date/time in shop timezone
  const localDate = now.toLocaleDateString('en-CA', { timeZone: timezone }); // "YYYY-MM-DD"
  const localTime = now.toLocaleTimeString('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }); // "HH:mm"
  const [y, m, d] = localDate.split('-').map(Number);
  const localDayOfWeek = new Date(y, m - 1, d).getDay(); // 0=Sun … 6=Sat

  if (localDate < schedule.startDate) return false;
  if (schedule.endDate && localDate > schedule.endDate) return false;
  if (schedule.daysOfWeek) {
    if (schedule.daysOfWeek.length === 0) return false;
    if (!schedule.daysOfWeek.includes(localDayOfWeek)) return false;
  }

  const start = schedule.startTime ?? '00:00';
  const end = schedule.endTime ?? '23:59';
  if (localTime < start || localTime > end) return false;

  return true;
}
