import { TranslationMap } from '../../../domain/menu/menuLanguage';

export interface CreateCategoryRequestDto {
  shopId: string;
  name: string;
  nameTranslations?: TranslationMap;
  sortOrder?: number;
  icon?: string;
  taxClassId?: string;
}

export interface CreateCategoryResultDto {
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
