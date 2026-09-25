import { TranslationMap } from '../../../domain/menu/menuLanguage';

export interface GetCategoriesByShopRequestDto {
  shopId: string;
}

export interface CategoryDto {
  id: string;
  shopId: string;
  name: string;
  nameTranslations: TranslationMap;
  sortOrder: number;
  icon?: string;
  taxClassId: string | null;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export type GetCategoriesByShopResultDto = CategoryDto[];
