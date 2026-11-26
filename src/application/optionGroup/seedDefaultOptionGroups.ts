import { buildDefaultOptionGroupSeeds } from '../../domain/optionGroup/defaultOptionGroupSeeds';
import { ShopOptionGroup, validateShopOptionGroupFields } from '../../domain/optionGroup/ShopOptionGroup';
import { defaultMenuLanguageForCountry } from '../../domain/menu/menuLanguage';
import { Shop } from '../../domain/shop/Shop';
import { createShopOptionGroup } from '../../infrastructure/cosmos/optionGroup/CosmosShopOptionGroupRepository';

/**
 * Gives a newly created shop its starter library groups (Size + Extras).
 * Errors propagate; the caller (executeCreateShop) decides they are non-fatal.
 */
export async function seedDefaultOptionGroupsForShop(shop: Shop): Promise<void> {
  const originalLanguage = shop.menuLanguages?.[0] ?? defaultMenuLanguageForCountry(shop.countryCode);
  for (const seed of buildDefaultOptionGroupSeeds(originalLanguage)) {
    const fields = validateShopOptionGroupFields(
      {
        name: seed.name,
        nameTranslations: seed.nameTranslations,
        minSelectable: seed.minSelectable,
        maxSelectable: seed.maxSelectable,
        options: seed.options.map((o) => ({
          name: o.name,
          nameTranslations: o.nameTranslations,
          priceDelta: o.priceDelta,
        })),
      },
      seed.kind,
      { allergens: new Set(), additives: new Set() },
      [],
      () => crypto.randomUUID(),
    );
    if ('error' in fields) throw new Error(fields.error);

    const now = new Date().toISOString();
    const group: ShopOptionGroup = {
      id: crypto.randomUUID(),
      shopId: shop.id,
      kind: seed.kind,
      ...fields,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    };
    await createShopOptionGroup(group);
  }
}
