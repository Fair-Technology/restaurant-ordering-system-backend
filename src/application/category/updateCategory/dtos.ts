import { TranslationMap } from '../../../domain/menu/menuLanguage';

export interface UpdateCategoryRequestDto {
  categoryId: string;
  shopId: string;
  name?: string;
  nameTranslations?: TranslationMap;
  sortOrder?: number;
  icon?: string;
  taxClassId?: string;
}

export interface UpdateCategoryResultDto {
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
