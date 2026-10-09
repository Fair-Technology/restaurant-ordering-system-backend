import { randomUUID } from 'node:crypto';
import type { Category } from '../../domain/category/Category';
import type { ComboContext, ProductCombo } from '../../domain/product/combo';
import type { Product } from '../../domain/product/Product';
import type { Shop } from '../../domain/shop/Shop';

export function comboContext(
  shop: Pick<Shop, 'countryCode'>,
  categories: readonly Category[],
  products: readonly Product[],
  existing: ProductCombo | null,
  newId: () => string = randomUUID,
): ComboContext {
  return {
    countryCode: shop.countryCode,
    categoryIds: new Set(categories.filter((c) => !c.isDeleted).map((c) => c.id)),
    dishIds: new Set(products.filter((p) => !p.isDeleted && !p.combo).map((p) => p.id)),
    existing,
    newId,
  };
}
