import { TranslationMap } from '../menu/menuLanguage';
import type { FulfilmentMode } from '../order/Order';
import { SpiceLevel } from './dietary';

export interface ProductSchedule {
  startDate: string; // "YYYY-MM-DD" — inclusive
  endDate?: string | null; // "YYYY-MM-DD" — inclusive; null/absent = run indefinitely
  startTime?: string | null; // "HH:mm" 24-hour — daily window open; absent = 00:00
  endTime?: string | null; // "HH:mm" 24-hour — daily window close; absent = 23:59
  daysOfWeek?: number[]; // 0=Sun 1=Mon … 6=Sat; schedule updates require at least one selected day
  // Optional special pricing during this window
  offerPrice?: number | null; // cents; must be < product.price when set
  offerLabel?: string | null; // optional display label, max 50 chars
}

export interface ProductImage {
  id: string; // UUID for the image
  url: string; // Full blob URL (without SAS)
  alt?: string; // Optional alt text for accessibility
  sortOrder?: number; // Optional sort order for image display
  createdAt: string; // ISO datetime when image was added
}

export interface ProductOption {
  id: string;
  name: string;
  nameTranslations?: TranslationMap;
  priceDelta: number; // cents
  isAvailable: boolean; // independent availability
}

export interface ProductVariantGroup {
  id: string;
  name: string;
  nameTranslations?: TranslationMap;
  options: ProductOption[];
}

export interface ProductAddonGroup {
  id: string;
  name: string;
  nameTranslations?: TranslationMap;
  minSelectable: number; // e.g. 0 or 1
  maxSelectable: number; // no unlimited; large number allowed
  options: ProductOption[];
}

export interface Product {
  // Identity & ownership
  id: string; // UUID (Cosmos item id)
  shopId: string; // owning shop UUID

  // Core info
  name: string; // product name, original language
  description: string; // original language
  nameTranslations?: TranslationMap;
  descriptionTranslations?: TranslationMap;

  // Pricing
  price: number; // base price in cents (mandatory, 0 only if truly free)

  // Categorisation
  categoryIds: string[]; // references Category ids (no duplication)

  // Images
  images: ProductImage[];

  // Variants (optional)
  variantGroups?: ProductVariantGroup[];

  // Addons (optional)
  addonGroups?: ProductAddonGroup[];

  // Food law: mandatory before the dish appears on the menu
  allergenIds: string[] | null; // null = not yet declared
  additiveIds: string[] | null;

  // Dietary info
  dietaryTagIds: string[];
  spiceLevel: SpiceLevel | null;
  prepMinutes: number | null; // 1..240
  unavailableModes?: FulfilmentMode[]; // absent = offered for every mode

  // Tax
  taxClassId: string | null; // per-dish override; null = inherit from category

  // Availability schedule (optional)
  schedule?: ProductSchedule | null;

  // Availability & lifecycle
  isAvailable: boolean; // visible/purchasable if true
  isDeleted: boolean; // soft delete flag

  // Audit
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
}

export function isDeclared(p: { allergenIds?: string[] | null; additiveIds?: string[] | null }): boolean {
  return Array.isArray(p.allergenIds) && Array.isArray(p.additiveIds);
}

export function isOnMenu(p: {
  isAvailable: boolean;
  isDeleted: boolean;
  allergenIds?: string[] | null;
  additiveIds?: string[] | null;
}): boolean {
  return p.isAvailable && !p.isDeleted && isDeclared(p);
}
