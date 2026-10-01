import { TranslationMap } from '../../domain/menu/menuLanguage';
import { isDeclared, Product } from '../../domain/product/Product';
import { SpiceLevel } from '../../domain/product/dietary';

export interface ProductMenuFieldsDto {
  nameTranslations: TranslationMap;
  descriptionTranslations: TranslationMap;
  allergenIds: string[] | null;
  additiveIds: string[] | null;
  dietaryTagIds: string[];
  spiceLevel: SpiceLevel | null;
  prepMinutes: number | null;
  taxClassId: string | null;
  isDeclared: boolean;
}

export function toMenuFieldsDto(p: Product): ProductMenuFieldsDto {
  return {
    nameTranslations: p.nameTranslations ?? {},
    descriptionTranslations: p.descriptionTranslations ?? {},
    allergenIds: Array.isArray(p.allergenIds) ? p.allergenIds : null,
    additiveIds: Array.isArray(p.additiveIds) ? p.additiveIds : null,
    dietaryTagIds: p.dietaryTagIds ?? [],
    spiceLevel: p.spiceLevel ?? null,
    prepMinutes: p.prepMinutes ?? null,
    taxClassId: p.taxClassId ?? null,
    isDeclared: isDeclared(p),
  };
}
