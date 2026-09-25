import { ProductAddonGroup, ProductImage, ProductSchedule, ProductVariantGroup } from '../../../domain/product/Product';
import { TranslationMap } from '../../../domain/menu/menuLanguage';
import { SpiceLevel } from '../../../domain/product/dietary';
import { ProductMenuFieldsDto } from '../menuFieldsDto';

export interface UpdateProductRequestDto {
  productId: string;
  shopId: string;
  name?: string;
  description?: string;
  price?: number;
  categoryIds?: string[];
  images?: ProductImage[];
  nameTranslations?: TranslationMap;
  descriptionTranslations?: TranslationMap;
  allergenIds?: string[] | null;
  additiveIds?: string[] | null;
  dietaryTagIds?: string[];
  spiceLevel?: SpiceLevel | null;
  prepMinutes?: number | null;
  taxClassId?: string | null;
  variantGroups?: ProductVariantGroup[];
  addonGroups?: ProductAddonGroup[];
  isAvailable?: boolean;
  schedule?: ProductSchedule | null;
}

export interface UpdateProductResultDto extends ProductMenuFieldsDto {
  id: string;
  shopId: string;
  name: string;
  description: string;
  price: number;
  isAvailable: boolean;
  isDeleted: boolean;
  schedule?: ProductSchedule | null;
  createdAt: string;
  updatedAt: string;
}
