import { TranslationMap } from '../menu/menuLanguage';
import type { FulfilmentMode } from '../order/Order';
import type { ProductCombo } from './combo';
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
  offerLabelTranslations?: TranslationMap; // offerLabel in the shop's other menu languages, max 50 chars each (SPECS §12)
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
  allergenIds?: string[]; // what choosing this option adds to the dish; absent on records saved before 2026-10 = none
  additiveIds?: string[];
  category?: string; // storefront groups extras under this heading; absent = ungrouped
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
  maxSelectable: number; // max picks; whole number, 0 <= minSelectable <= maxSelectable <= options.length
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
  // Per-category display order. Key = category id, value = position (ascending). A dish not
  // present in the map for a category it belongs to is "unordered" for that category — sorts
  // after every ordered dish, by name. Do NOT reuse `images[].sortOrder` (that's image order only).
  categoryOrder?: { [categoryId: string]: number };

  // Images
  images: ProductImage[];

  // Variants (optional)
  variantGroups?: ProductVariantGroup[];
  /** Ids of shop-level option groups (domain/optionGroup) this dish reuses; resolved to inline groups on read. */
  optionGroupRefs?: string[];

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
  ageRestricted?: boolean; // true = 18+/alcohol dish; absent/false = no restriction

  // Tax
  taxClassId: string | null; // per-dish override; null = inherit from category

  // Availability schedule (optional)
  schedule?: ProductSchedule | null;

  // Combo: absent/null = a dish. Set only by the combo endpoints (application/combo)
  combo?: ProductCombo | null;

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

/**
 * Sort a category's dishes: ordered ones first by categoryOrder[categoryId] ascending, then unordered
 * ones by name (locale compare). Stable for ties; returns a new array.
 */
export function sortByCategoryOrder<T extends { id: string; name: string; categoryOrder?: Record<string, number> }>(
  products: T[],
  categoryId: string,
): T[] {
  const pos = (p: T): number | undefined => {
    const v = p.categoryOrder?.[categoryId];
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  };
  return [...products].sort((a, b) => {
    const pa = pos(a);
    const pb = pos(b);
    if (pa !== undefined && pb !== undefined) return pa - pb;
    if (pa !== undefined) return -1;
    if (pb !== undefined) return 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Sorts a category's products for the storefront: every dish in its dish order, then every combo in its
 * combo order. A combo's position (from the combo-order endpoint) only ranks it among other combos — it
 * can never land ahead of or interleaved with a dish. Unordered combos trail ordered ones, by name, same
 * rule as unordered dishes.
 */
export function sortCategoryProducts<
  T extends { id: string; name: string; categoryOrder?: Record<string, number>; combo?: unknown },
>(products: T[], categoryId: string): T[] {
  const dishes = products.filter((p) => !p.combo);
  const combos = products.filter((p) => !!p.combo);
  return [...sortByCategoryOrder(dishes, categoryId), ...sortByCategoryOrder(combos, categoryId)];
}
