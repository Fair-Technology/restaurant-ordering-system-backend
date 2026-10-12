import type { CategorySchedule } from '../../../domain/category/Category';
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
  isAvailable: boolean; // false = switched off, hidden on the storefront
  schedule: CategorySchedule | null; // weekly times it shows; null = always
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}
