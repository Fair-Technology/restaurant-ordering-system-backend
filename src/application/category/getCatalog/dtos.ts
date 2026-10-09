import { FulfilmentMode } from '../../../domain/order/Order';
import { MenuLanguage } from '../../../domain/reference/ReferenceLists';

export interface CatalogOptionDto {
  id: string;
  name: string;
  priceDelta: number;
  isAvailable: boolean;
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
  allergens: CatalogLabelDto[];
  additives: CatalogAdditiveDto[];
  dietaryTags: CatalogLabelDto[];
  spice: CatalogLabelDto | null;
  unavailableModes: FulfilmentMode[]; // modes this dish is not offered for
  combo: CatalogComboDto | null; // null for a dish
  createdAt: string;
  updatedAt: string;
}

export interface CatalogCategoryDto {
  id: string;
  name: string;
  sortOrder: number;
  icon?: string;
  products: CatalogProductDto[];
}

export interface GetCatalogResultDto {
  language: MenuLanguage;
  languages: MenuLanguage[];
  categories: CatalogCategoryDto[];
}
