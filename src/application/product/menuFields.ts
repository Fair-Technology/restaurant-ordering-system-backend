import { FULFILMENT_MODES, FulfilmentMode } from '../../domain/order/Order';
import { UNAVAILABLE_MODES_ERROR } from '../../domain/order/orderErrors';
import { dietaryConflict, DIETARY_TAGS, SpiceLevel } from '../../domain/product/dietary';
import { normaliseTranslations, TranslationMap } from '../../domain/menu/menuLanguage';
import { ProductAddonGroup, ProductOption, ProductVariantGroup } from '../../domain/product/Product';
import { ReferenceListsDoc } from '../../domain/reference/ReferenceLists';

export interface MenuFieldsInput {
  nameTranslations?: unknown;
  descriptionTranslations?: unknown;
  allergenIds?: unknown;
  additiveIds?: unknown;
  dietaryTagIds?: unknown;
  spiceLevel?: unknown;
  prepMinutes?: unknown;
  unavailableModes?: unknown;
  taxClassId?: unknown;
  variantGroups?: ProductVariantGroup[];
  addonGroups?: ProductAddonGroup[];
}

export interface ValidMenuFields {
  nameTranslations?: TranslationMap;
  descriptionTranslations?: TranslationMap;
  allergenIds?: string[] | null;
  additiveIds?: string[] | null;
  dietaryTagIds?: string[];
  spiceLevel?: SpiceLevel | null;
  prepMinutes?: number | null;
  unavailableModes?: FulfilmentMode[];
  taxClassId?: string | null;
  variantGroups?: ProductVariantGroup[];
  addonGroups?: ProductAddonGroup[];
}

const SPICE_VALUES: ReadonlyArray<SpiceLevel | null> = [null, 'mild', 'medium', 'hot'];

function dedupe(ids: string[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

function validateIdList(
  value: unknown,
  known: ReadonlySet<string>,
  fieldName: string,
  unknownLabel: string,
): string[] | null | string {
  if (value === null) return null;
  if (!Array.isArray(value)) return `${fieldName} must be an array or null`;
  for (const id of value) {
    if (typeof id !== 'string' || !known.has(id)) {
      return `Unknown ${unknownLabel}: ${id}`;
    }
  }
  return dedupe(value as string[]);
}

function validateGroup(
  group: ProductVariantGroup | ProductAddonGroup,
): ProductVariantGroup | ProductAddonGroup | string {
  const nameTranslations = normaliseTranslations(group.nameTranslations, 120);
  if (typeof nameTranslations === 'string') return nameTranslations;

  const options: ProductOption[] = [];
  for (const option of group.options) {
    const optionTranslations = normaliseTranslations(option.nameTranslations, 120);
    if (typeof optionTranslations === 'string') return optionTranslations;
    options.push({ ...option, nameTranslations: optionTranslations });
  }

  return { ...group, nameTranslations, options } as ProductVariantGroup | ProductAddonGroup;
}

export function validateMenuFields(
  input: MenuFieldsInput,
  refs: ReferenceListsDoc,
  existing: { allergenIds?: string[] | null; dietaryTagIds?: string[] } | null,
): ValidMenuFields | { error: string } {
  const out: ValidMenuFields = {};

  const allergenIds = new Set(refs.allergens.map((a) => a.id));
  const additiveIds = new Set(refs.additives.map((a) => a.id));
  const dietaryTagIds = new Set<string>(DIETARY_TAGS.map((t) => t.id));

  if ('allergenIds' in input && input.allergenIds !== undefined) {
    const result = validateIdList(input.allergenIds, allergenIds, 'allergenIds', 'allergen');
    if (typeof result === 'string') return { error: result };
    out.allergenIds = result;
  }

  if ('additiveIds' in input && input.additiveIds !== undefined) {
    const result = validateIdList(input.additiveIds, additiveIds, 'additiveIds', 'additive');
    if (typeof result === 'string') return { error: result };
    out.additiveIds = result;
  }

  if ('dietaryTagIds' in input && input.dietaryTagIds !== undefined) {
    if (!Array.isArray(input.dietaryTagIds)) return { error: 'dietaryTagIds must be an array' };
    for (const id of input.dietaryTagIds) {
      if (typeof id !== 'string' || !dietaryTagIds.has(id)) {
        return { error: `Unknown dietary tag: ${id}` };
      }
    }
    out.dietaryTagIds = dedupe(input.dietaryTagIds as string[]);
  }

  if ('spiceLevel' in input && input.spiceLevel !== undefined) {
    if (!SPICE_VALUES.includes(input.spiceLevel as SpiceLevel | null)) {
      return { error: 'spiceLevel must be mild, medium, hot or null' };
    }
    out.spiceLevel = input.spiceLevel as SpiceLevel | null;
  }

  if ('prepMinutes' in input && input.prepMinutes !== undefined) {
    const v = input.prepMinutes;
    const valid = v === null || (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 240);
    if (!valid) {
      return { error: 'prepMinutes must be a whole number of minutes between 1 and 240, or null' };
    }
    out.prepMinutes = v as number | null;
  }

  if ('unavailableModes' in input && input.unavailableModes !== undefined) {
    const v = input.unavailableModes;
    if (!Array.isArray(v) || v.some((m) => !(FULFILMENT_MODES as readonly unknown[]).includes(m))) {
      return { error: UNAVAILABLE_MODES_ERROR };
    }
    out.unavailableModes = FULFILMENT_MODES.filter((m) => (v as unknown[]).includes(m));
  }

  if ('taxClassId' in input && input.taxClassId !== undefined) {
    const v = input.taxClassId;
    if (v !== null) {
      const isActive = refs.taxClasses.some((c) => c.id === v && c.isActive);
      if (!isActive) return { error: `Unknown tax class: ${v}` };
    }
    out.taxClassId = v as string | null;
  }

  if ('nameTranslations' in input && input.nameTranslations !== undefined) {
    const result = normaliseTranslations(input.nameTranslations, 120);
    if (typeof result === 'string') return { error: result };
    out.nameTranslations = result;
  }

  if ('descriptionTranslations' in input && input.descriptionTranslations !== undefined) {
    const result = normaliseTranslations(input.descriptionTranslations, 2000);
    if (typeof result === 'string') return { error: result };
    out.descriptionTranslations = result;
  }

  if (input.variantGroups) {
    const groups: ProductVariantGroup[] = [];
    for (const group of input.variantGroups) {
      const result = validateGroup(group);
      if (typeof result === 'string') return { error: result };
      groups.push(result as ProductVariantGroup);
    }
    out.variantGroups = groups;
  }

  if (input.addonGroups) {
    const groups: ProductAddonGroup[] = [];
    for (const group of input.addonGroups) {
      const result = validateGroup(group);
      if (typeof result === 'string') return { error: result };
      groups.push(result as ProductAddonGroup);
    }
    out.addonGroups = groups;
  }

  const conflict = dietaryConflict(
    out.dietaryTagIds ?? existing?.dietaryTagIds ?? [],
    out.allergenIds ?? existing?.allergenIds ?? [],
  );
  if (conflict) return { error: conflict };

  return out;
}
