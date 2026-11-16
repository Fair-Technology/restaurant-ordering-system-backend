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

  // Tax
  taxClassId: string | null; // per-dish override; null = inherit from category

  // Availability schedule (optional)
  schedule?: ProductSchedule | null;

  // Combo: absent/null = a dish. Set only by the combo endpoints (application/combo)
  combo?: ProductCombo | null;

  // Availability & lifecycle
  isAvailable: boolean; // visible/purchasable if true
  // Sold-out-until: ISO instant while which the dish cannot be ordered, without touching isAvailable.
  // null/absent = nothing scheduled, isAvailable governs alone. The value is stored as an instant; the shop
  // timezone only decides which instant a UI writes (e.g. end of its service day).
  unavailableUntil?: string | null;
  isDeleted: boolean; // soft delete flag

  // Audit
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
}

export function isDeclared(p: { allergenIds?: string[] | null; additiveIds?: string[] | null }): boolean {
  return Array.isArray(p.allergenIds) && Array.isArray(p.additiveIds);
}

/**
 * True while the dish is marked sold out: `unavailableUntil` is still in the future. A malformed value is
 * ignored (treated as no sold-out window) rather than hiding a dish forever.
 */
export function isSoldOut(p: { unavailableUntil?: string | null }, now: Date): boolean {
  const until = p.unavailableUntil;
  if (!until) return false;
  const at = Date.parse(until);
  return Number.isFinite(at) && at > now.getTime();
}

/** The dish can be ordered at `now`: switched on, and not inside a sold-out window. */
export function isAvailableNow(
  p: { isAvailable: boolean; unavailableUntil?: string | null },
  now: Date,
): boolean {
  return p.isAvailable && !isSoldOut(p, now);
}

export function isOnMenu(p: {
  isAvailable: boolean;
  isDeleted: boolean;
  allergenIds?: string[] | null;
  additiveIds?: string[] | null;
}): boolean {
  return p.isAvailable && !p.isDeleted && isDeclared(p);
}
