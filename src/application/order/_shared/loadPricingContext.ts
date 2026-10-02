import type { Category } from '../../../domain/category/Category';
import type { Product } from '../../../domain/product/Product';
import type { ReferenceListsDoc } from '../../../domain/reference/ReferenceLists';
import type { Shop } from '../../../domain/shop/Shop';
import { findCategoriesByShopId } from '../../../infrastructure/cosmos/category/CosmosCategoryRepository';
import { findProductById } from '../../../infrastructure/cosmos/product/CosmosProductRepository';
import { getReferenceLists } from '../../../infrastructure/cosmos/reference/CosmosReferenceListsRepository';

export interface PricingContext {
  products: Map<string, Product>;
  categories: Category[];
  refs: ReferenceListsDoc;
}

export async function loadPricingContext(shop: Shop, productIds: string[]): Promise<PricingContext> {
  const uniqueIds = [...new Set(productIds)];
  const [found, categories, refs] = await Promise.all([
    Promise.all(uniqueIds.map((id) => findProductById(id, shop.id))),
    findCategoriesByShopId(shop.id),
    getReferenceLists(shop.countryCode ?? ''),
  ]);
  const products = new Map<string, Product>();
  for (const p of found) if (p) products.set(p.id, p);
  return { products, categories, refs };
}
