import { FulfilmentMode } from '../../../domain/order/Order';
import { MenuLanguage } from '../../../domain/reference/ReferenceLists';

export interface CatalogOptionDto {
  id: string;
  name: string;
  priceDelta: number;
  isAvailable: boolean;
  allergens: CatalogLabelDto[];
  additives: CatalogAdditiveDto[];
  /** Heading the storefront groups this extra under; null = ungrouped. */
  category: string | null;
}

export interface CatalogVariantGroupDto {
  id: string;
  name: string;
  options: CatalogOptionDto[];
}

export interface CatalogAddonGroupDto {
  id: string;
  name: string;
  minSelectable: number;
  maxSelectable: number;
  options: CatalogOptionDto[];
}

export interface CatalogLabelDto {
  id: string;
  label: string;
}

export interface CatalogAdditiveDto {
  id: string;
  code: number;
  label: string;
}

export interface CatalogComboDto {
  groups: { id: string; name: string; productIds: string[] }[]; // only dishes that are on this menu right now
}

export interface CatalogProductDto {
  id: string;
  name: string;
  description: string;
  price: number;
  offerPrice?: number | null;
  offerLabel?: string | null;
  images: { id: string; url: string; alt?: string; sortOrder: number }[];
  variants: CatalogVariantGroupDto[];
  addons: CatalogAddonGroupDto[];
  isAvailable: boolean;
  unavailableUntil: string | null; // end of the sold-out window; null = none set
  /** Inside a sold-out window right now: show the dish but do not let it be ordered. */
  soldOut: boolean;
  allergens: CatalogLabelDto[];
  additives: CatalogAdditiveDto[];
  dietaryTags: CatalogLabelDto[];
  spice: CatalogLabelDto | null;
  unavailableModes: FulfilmentMode[]; // modes this dish is not offered for
  ageRestricted: boolean; // 18+/alcohol dish
  availableNow: boolean; // one of its categories is inside its times right now
  combo: CatalogComboDto | null; // null for a dish
  createdAt: string;
  updatedAt: string;
}

/** A category's weekly times in the shop time zone (0=Sunday); the end is exclusive. */
export interface CatalogCategoryScheduleDto {
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
}

export interface CatalogCategoryDto {
  id: string;
  name: string;
  sortOrder: number;
  icon?: string;
  availableNow: boolean; // inside its times right now; false = the storefront lists it under "Other times"
  schedule: CatalogCategoryScheduleDto | null; // null = always
  products: CatalogProductDto[];
}

export interface GetCatalogResultDto {
  language: MenuLanguage;
  languages: MenuLanguage[];
  categories: CatalogCategoryDto[];
}
