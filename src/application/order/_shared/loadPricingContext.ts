import type { Category } from '../../../domain/category/Category';
import type { Product } from '../../../domain/product/Product';
import type { ReferenceListsDoc } from '../../../domain/reference/ReferenceLists';
import type { Shop } from '../../../domain/shop/Shop';
import { findCategoriesByShopId } from '../../../infrastructure/cosmos/category/CosmosCategoryRepository';
import { findProductById } from '../../../infrastructure/cosmos/product/CosmosProductRepository';
import { findShopOptionGroupsByShopId } from '../../../infrastructure/cosmos/optionGroup/CosmosShopOptionGroupRepository';
import { resolveProductOptionGroups } from '../../../domain/product/optionGroupRefs';
import { getReferenceLists } from '../../../infrastructure/cosmos/reference/CosmosReferenceListsRepository';

export interface PricingContext {
  products: Map<string, Product>;
  categories: Category[];
  refs: ReferenceListsDoc;
}

export async function loadPricingContext(shop: Shop, productIds: string[]): Promise<PricingContext> {
  const uniqueIds = [...new Set(productIds)];
  const [found, categories, refs, library] = await Promise.all([
    Promise.all(uniqueIds.map((id) => findProductById(id, shop.id))),
    findCategoriesByShopId(shop.id),
    getReferenceLists(shop.countryCode ?? ''),
    findShopOptionGroupsByShopId(shop.id),
  ]);
  const libraryMap = new Map(library.map((g) => [g.id, g]));
  const products = new Map<string, Product>();
  for (const p of found) if (p) products.set(p.id, resolveProductOptionGroups(p, libraryMap));
  return { products, categories, refs };
}
