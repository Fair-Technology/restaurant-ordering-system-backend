import { normaliseTranslations, TranslationMap } from '../menu/menuLanguage';

/**
 * A shop-wide option group: defined once ("Choose a drink"), reused by many dishes.
 * Each option carries the one availability switch for the whole menu ("out of Coke").
 */
export type ShopOptionGroupKind = 'variant' | 'addon';

export interface ShopOptionGroupOption {
  id: string;
  name: string;
  nameTranslations?: TranslationMap;
  priceDelta: number; // cents, integer 0..100000
  isAvailable: boolean; // the one "out of Coke" switch
  allergenIds?: string[];
  additiveIds?: string[];
}

export interface ShopOptionGroup {
  id: string;
  shopId: string;
  kind: ShopOptionGroupKind; // immutable after create
  name: string; // 1..60 chars
  nameTranslations?: TranslationMap;
  minSelectable: number; // addon: picks required; variant groups store 1/1
  maxSelectable: number; // addon: max picks; variant groups store 1/1
  options: ShopOptionGroupOption[]; // 1..50
  isDeleted: boolean;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export const SHOP_OPTION_GROUP_KINDS: readonly ShopOptionGroupKind[] = ['variant', 'addon'];
export const MAX_OPTION_GROUP_OPTIONS = 50;
export const SHOP_OPTION_GROUP_KIND_ERROR = "kind must be 'variant' or 'addon'";
export const SHOP_OPTION_GROUP_NAME_ERROR = 'name must be 1 to 60 characters';
export const SHOP_OPTION_GROUP_OPTIONS_ERROR =
  'options must hold 1 to 50 options, each with a name of 1 to 60 characters and a whole priceDelta of 0 to 100000 cents';
export const SHOP_OPTION_GROUP_SELECTION_ERROR =
  'minSelectable and maxSelectable must be whole numbers with 0 <= minSelectable <= maxSelectable';
export const SHOP_OPTION_GROUP_NOT_FOUND_ERROR = 'Option group not found';
export const SHOP_OPTION_GROUP_OPTION_NOT_FOUND_ERROR = 'Option not found';

export const SHOP_OPTION_GROUP_MAX_SELECTABLE_ERROR = 'maxSelectable must not exceed the number of options';
export const SHOP_OPTION_GROUP_DUPLICATE_OPTION_ID_ERROR = 'option ids must be unique within the group';
export const SHOP_OPTION_GROUP_OPTION_AVAILABILITY_ERROR = 'isAvailable must be true or false';
export const SHOP_OPTION_GROUP_OPTION_ALLERGENS_ERROR = "Each option's allergenIds must be a list of allergen ids";
export const SHOP_OPTION_GROUP_OPTION_ADDITIVES_ERROR = "Each option's additiveIds must be a list of additive ids";

const NAME_MAX = 60;
const TRANSLATION_MAX = 120;
const PRICE_DELTA_MAX = 100000;

export function isShopOptionGroupKind(value: unknown): value is ShopOptionGroupKind {
  return (SHOP_OPTION_GROUP_KINDS as readonly unknown[]).includes(value);
}

/** Trimmed name of 1..60 characters, or null. */
export function normaliseOptionGroupName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= NAME_MAX ? trimmed : null;
}

function isWholeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

/** The editable part of a group, as sent on create (with kind) or update (kind ignored). */
export interface ShopOptionGroupInput {
  name?: unknown;
  nameTranslations?: unknown;
  minSelectable?: unknown;
  maxSelectable?: unknown;
  options?: unknown;
}

export type ValidShopOptionGroupFields = Pick<
  ShopOptionGroup,
  'name' | 'nameTranslations' | 'minSelectable' | 'maxSelectable' | 'options'
>;

export interface KnownMenuReferenceIds {
  allergens: ReadonlySet<string>;
  additives: ReadonlySet<string>;
}

function referenceIdList(
  value: unknown,
  previous: string[] | undefined,
  known: ReadonlySet<string>,
  unknownLabel: 'allergen' | 'additive',
  shapeError: string,
): string[] | { error: string } {
  if (value === undefined || value === null) return Array.isArray(previous) ? [...previous] : [];
  if (!Array.isArray(value)) return { error: shapeError };
  const out: string[] = [];
  for (const id of value) {
    if (typeof id !== 'string' || !known.has(id)) return { error: `Unknown ${unknownLabel}: ${id}` };
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/** True when `value` is a whole number of cents in 0..100000 — the shape every priceDelta must have. */
export function isValidPriceDelta(value: unknown): value is number {
  return isWholeNumber(value) && value >= 0 && value <= PRICE_DELTA_MAX;
}

/**
 * Error message for an addon group's min/max pair, or null when valid:
 * whole numbers with 0 <= min <= max, and max no greater than the option count.
 */
export function addonSelectionError(min: unknown, max: unknown, optionCount: number): string | null {
  if (!isWholeNumber(min) || !isWholeNumber(max) || min < 0 || min > max) {
    return SHOP_OPTION_GROUP_SELECTION_ERROR;
  }
  if (max > optionCount) return SHOP_OPTION_GROUP_MAX_SELECTABLE_ERROR;
  return null;
}

/**
 * Validates and normalises the editable fields of an option group (a full replace).
 * `previous` are the options already stored (update): their ids are kept, and an
 * omitted isAvailable/allergenIds/additiveIds carries over. Options without an id get
 * one from `newId`. Returns an error message on the first invalid field.
 */
export function validateShopOptionGroupFields(
  input: ShopOptionGroupInput,
  kind: ShopOptionGroupKind,
  known: KnownMenuReferenceIds,
  previous: readonly ShopOptionGroupOption[],
  newId: () => string,
): ValidShopOptionGroupFields | { error: string } {
  const name = normaliseOptionGroupName(input.name);
  if (name === null) return { error: SHOP_OPTION_GROUP_NAME_ERROR };

  const nameTranslations = normaliseTranslations(input.nameTranslations, TRANSLATION_MAX);
  if (typeof nameTranslations === 'string') return { error: nameTranslations };

  const rawOptions = input.options;
  if (!Array.isArray(rawOptions) || rawOptions.length < 1 || rawOptions.length > MAX_OPTION_GROUP_OPTIONS) {
    return { error: SHOP_OPTION_GROUP_OPTIONS_ERROR };
  }

  const previousById = new Map(previous.map((o) => [o.id, o] as const));
  const options: ShopOptionGroupOption[] = [];
  const seenIds = new Set<string>();
  for (const raw of rawOptions as unknown[]) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: SHOP_OPTION_GROUP_OPTIONS_ERROR };
    const o = raw as Record<string, unknown>;

    const optionName = normaliseOptionGroupName(o.name);
    const priceDelta = o.priceDelta;
    if (optionName === null || !isValidPriceDelta(priceDelta)) {
      return { error: SHOP_OPTION_GROUP_OPTIONS_ERROR };
    }

    let id: string;
    if (o.id === undefined || o.id === null || (typeof o.id === 'string' && o.id.trim() === '')) {
      id = newId();
    } else if (typeof o.id === 'string') {
      id = o.id.trim();
    } else {
      return { error: SHOP_OPTION_GROUP_OPTIONS_ERROR };
    }
    if (seenIds.has(id)) return { error: SHOP_OPTION_GROUP_DUPLICATE_OPTION_ID_ERROR };
    seenIds.add(id);
    const prev = previousById.get(id);

    if (o.isAvailable !== undefined && typeof o.isAvailable !== 'boolean') {
      return { error: SHOP_OPTION_GROUP_OPTION_AVAILABILITY_ERROR };
    }
    const isAvailable = typeof o.isAvailable === 'boolean' ? o.isAvailable : (prev?.isAvailable ?? true);

    const optionTranslations = normaliseTranslations(o.nameTranslations, TRANSLATION_MAX);
    if (typeof optionTranslations === 'string') return { error: optionTranslations };

    const allergenIds = referenceIdList(
      o.allergenIds, prev?.allergenIds, known.allergens, 'allergen', SHOP_OPTION_GROUP_OPTION_ALLERGENS_ERROR,
    );
    if (!Array.isArray(allergenIds)) return allergenIds;
    const additiveIds = referenceIdList(
      o.additiveIds, prev?.additiveIds, known.additives, 'additive', SHOP_OPTION_GROUP_OPTION_ADDITIVES_ERROR,
    );
    if (!Array.isArray(additiveIds)) return additiveIds;

    options.push({
      id,
      name: optionName,
      nameTranslations: optionTranslations,
      priceDelta,
      isAvailable,
      allergenIds,
      additiveIds,
    });
  }

  let minSelectable = 1;
  let maxSelectable = 1;
  if (kind === 'addon') {
    const min = input.minSelectable ?? 0;
    const max = input.maxSelectable ?? options.length;
    const selectionError = addonSelectionError(min, max, options.length);
    if (selectionError) return { error: selectionError };
    minSelectable = min as number;
    maxSelectable = max as number;
  }

  return { name, nameTranslations, minSelectable, maxSelectable, options };
}
