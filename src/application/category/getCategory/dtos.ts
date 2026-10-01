import { TranslationMap } from '../../../domain/menu/menuLanguage';

export interface GetCategoryRequestDto {
  categoryId: string;
  shopId: string;
}

export interface GetCategoryResultDto {
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
