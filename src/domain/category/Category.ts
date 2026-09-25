import { TranslationMap } from '../menu/menuLanguage';

export interface Category {
  // Identity & ownership
  id: string; // UUID (Cosmos item id)
  shopId: string; // owning shop UUID

  // Core info
  name: string; // category name, original language
  nameTranslations?: TranslationMap;
  sortOrder: number; // for ordering categories
  icon?: string; // optional Lucide icon name

  // Tax
  taxClassId: string | null; // references a ReferenceListsDoc tax class; null = country has none configured

  // Lifecycle
  isDeleted: boolean; // soft delete flag

  // Audit
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
}
