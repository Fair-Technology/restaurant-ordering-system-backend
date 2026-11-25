import { ShopOptionGroup, ShopOptionGroupOption } from '../optionGroup/ShopOptionGroup';
import { Product, ProductAddonGroup, ProductOption, ProductVariantGroup } from './Product';

function toProductOption(o: ShopOptionGroupOption): ProductOption {
  return {
    id: o.id,
    name: o.name,
    nameTranslations: o.nameTranslations,
    priceDelta: o.priceDelta,
    isAvailable: o.isAvailable,
    allergenIds: o.allergenIds,
    additiveIds: o.additiveIds,
    category: o.category,
  };
}

/** Materialises a dish's referenced library groups into its inline variant/addon groups. Unknown or deleted refs are skipped. */
export function resolveProductOptionGroups(
  product: Product,
  library: ReadonlyMap<string, ShopOptionGroup>,
): Product {
  const refs = product.optionGroupRefs;
  if (!refs || refs.length === 0) return product;

  const variants: ProductVariantGroup[] = [];
  const addons: ProductAddonGroup[] = [];
  for (const id of new Set(refs)) {
    const group = library.get(id);
    if (!group || group.isDeleted) continue;
    const options = group.options.map(toProductOption);
    if (group.kind === 'variant') {
      variants.push({ id: group.id, name: group.name, nameTranslations: group.nameTranslations, options });
    } else {
      addons.push({
        id: group.id,
        name: group.name,
        nameTranslations: group.nameTranslations,
        minSelectable: group.minSelectable,
        maxSelectable: group.maxSelectable,
        options,
      });
    }
  }

  return {
    ...product,
    variantGroups: [...(product.variantGroups ?? []), ...variants],
    addonGroups: [...(product.addonGroups ?? []), ...addons],
  };
}
