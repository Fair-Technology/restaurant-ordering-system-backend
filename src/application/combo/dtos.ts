import type { TranslationMap } from '../../domain/menu/menuLanguage';
import type { ComboGroup } from '../../domain/product/combo';
import type { Product, ProductImage } from '../../domain/product/Product';

export interface ComboDto {
  id: string;
  name: string;
  description: string;
  nameTranslations: TranslationMap;
  descriptionTranslations: TranslationMap;
  images: ProductImage[];
  priceCents: number;
  categoryId: string | null; // first categoryIds entry
  isAvailable: boolean;
  bmfDrinkShare: boolean;
  groups: Array<ComboGroup & { nameTranslations: TranslationMap }>;
  createdAt: string;
  updatedAt: string;
}

export function toComboDto(p: Product): ComboDto {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    nameTranslations: p.nameTranslations ?? {},
    descriptionTranslations: p.descriptionTranslations ?? {},
    images: p.images ?? [],
    priceCents: p.price,
    categoryId: p.categoryIds[0] ?? null,
    isAvailable: p.isAvailable,
    bmfDrinkShare: p.combo?.bmfDrinkShare ?? false,
    groups: (p.combo?.groups ?? []).map((g) => ({ ...g, nameTranslations: g.nameTranslations ?? {} })),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
