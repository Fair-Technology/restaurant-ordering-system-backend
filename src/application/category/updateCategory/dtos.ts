import type { CategorySchedule } from '../../../domain/category/Category';
import { TranslationMap } from '../../../domain/menu/menuLanguage';

export interface UpdateCategoryRequestDto {
  categoryId: string;
  shopId: string;
  name?: string;
  nameTranslations?: TranslationMap;
  sortOrder?: number;
  icon?: string;
  taxClassId?: string;
  isAvailable?: boolean;
  schedule?: CategorySchedule | null; // null clears it
}

export interface UpdateCategoryResultDto {
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
