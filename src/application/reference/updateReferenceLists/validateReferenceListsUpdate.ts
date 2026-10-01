import { FULFILMENT_MODES } from '../../../domain/order/Order';
import { AdditiveDef, AllergenDef, ReferenceListsDoc, TaxClassDef, TaxRateRow } from '../../../domain/reference/ReferenceLists';

export interface ReferenceListsUpdateDto {
  allergens: AllergenDef[];
  additives: AdditiveDef[];
  taxClasses: TaxClassDef[];
  defaultTaxClassId: string | null;
  taxRates: TaxRateRow[];
}

const ID_PATTERN = /^[a-z0-9_]{2,40}$/;
const EFFECTIVE_FROM_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})$/;

function isLabelledList(value: unknown): value is Array<{ id: unknown; labels: unknown; isActive: unknown }> {
  return Array.isArray(value);
}

function validateLabelledList(
  list: Array<{ id: unknown; labels: unknown; isActive: unknown }>,
): string | null {
  const seen = new Set<string>();
  for (const entry of list) {
    const id = entry?.id;
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
      return `Invalid id: ${id}`;
    }
    const labels = entry?.labels as { de?: unknown; en?: unknown } | undefined;
    const de = labels?.de;
    const en = labels?.en;
    if (
      typeof de !== 'string' ||
      de.trim() === '' ||
      de.length > 80 ||
      typeof en !== 'string' ||
      en.trim() === '' ||
      en.length > 80
    ) {
      return `Labels for ${id} need non-empty de and en text`;
    }
    if (typeof entry?.isActive !== 'boolean') {
      return `isActive for ${id} must be true or false`;
    }
    if (seen.has(id)) {
      return `Duplicate id: ${id}`;
    }
    seen.add(id);
  }
  return null;
}

function idsOf(list: Array<{ id: string }>): Set<string> {
  return new Set(list.map((x) => x.id));
}

function rateKey(r: { taxClassId: string; fulfilmentMode: string; rateBasisPoints: number; effectiveFrom: string }): string {
  return `${r.taxClassId}|${r.fulfilmentMode}|${r.rateBasisPoints}|${Date.parse(r.effectiveFrom)}`;
}

export function validateReferenceListsUpdate(
  baseline: ReferenceListsDoc,
  next: unknown,
  now: Date,
): ReferenceListsUpdateDto | string {
  const body = next as {
    allergens?: unknown;
    additives?: unknown;
    taxClasses?: unknown;
    taxRates?: unknown;
    defaultTaxClassId?: unknown;
  } | null;

  // Rule 1
  if (
    !body ||
    typeof body !== 'object' ||
    !isLabelledList(body.allergens) ||
    !isLabelledList(body.additives) ||
    !isLabelledList(body.taxClasses) ||
    !Array.isArray(body.taxRates)
  ) {
    return 'Body must contain allergens, additives, taxClasses and taxRates arrays';
  }

  const allergens = body.allergens as AllergenDef[];
  const additives = body.additives as AdditiveDef[];
  const taxClasses = body.taxClasses as TaxClassDef[];
  const taxRates = body.taxRates as TaxRateRow[];

  // Rule 2
  for (const list of [allergens, additives, taxClasses]) {
    const err = validateLabelledList(list);
    if (err) return err;
  }

  // Rule 3
  const codes = additives.map((a) => a.code);
  if (
    codes.some((c) => typeof c !== 'number' || !Number.isInteger(c) || c < 1) ||
    new Set(codes).size !== codes.length
  ) {
    return 'Additive codes must be unique whole numbers';
  }

  // Rule 4
  const nextAllergenIds = idsOf(allergens);
  const nextAdditiveIds = idsOf(additives);
  const nextTaxClassIds = idsOf(taxClasses);
  for (const [name, baselineList, nextIds] of [
    ['Allergen', baseline.allergens, nextAllergenIds],
    ['Additive', baseline.additives, nextAdditiveIds],
    ['Tax class', baseline.taxClasses, nextTaxClassIds],
  ] as const) {
    for (const entry of baselineList) {
      if (!nextIds.has(entry.id)) {
        return `${name} entry ${entry.id} cannot be removed — mark it inactive instead`;
      }
    }
  }

  // Rule 5
  for (const row of taxRates) {
    if (!nextTaxClassIds.has(row.taxClassId)) {
      return `Rate row refers to unknown tax class: ${row.taxClassId}`;
    }
    if (!(FULFILMENT_MODES as readonly string[]).includes(row.fulfilmentMode)) {
      return `Unknown fulfilment mode: ${row.fulfilmentMode}`;
    }
    if (
      typeof row.rateBasisPoints !== 'number' ||
      !Number.isInteger(row.rateBasisPoints) ||
      row.rateBasisPoints < 0 ||
      row.rateBasisPoints > 10000
    ) {
      return 'rateBasisPoints must be a whole number between 0 and 10000';
    }
    if (
      typeof row.effectiveFrom !== 'string' ||
      !EFFECTIVE_FROM_PATTERN.test(row.effectiveFrom) ||
      Number.isNaN(Date.parse(row.effectiveFrom))
    ) {
      return `effectiveFrom must be an ISO date-time with offset: ${row.effectiveFrom}`;
    }
  }

  // Rule 6
  const nextKeys = new Set(taxRates.map(rateKey));
  for (const row of baseline.taxRates) {
    if (!nextKeys.has(rateKey(row))) {
      return 'Existing rate rows cannot be edited or removed — add a new row with a later effective date';
    }
  }

  // Rule 7
  const seenModeKeys = new Set<string>();
  for (const row of taxRates) {
    const modeKey = `${row.taxClassId}|${row.fulfilmentMode}|${Date.parse(row.effectiveFrom)}`;
    if (seenModeKeys.has(modeKey)) {
      return 'Two rate rows for the same class and mode cannot start at the same moment';
    }
    seenModeKeys.add(modeKey);
  }

  // Rule 8
  const baselineKeys = new Set(baseline.taxRates.map(rateKey));
  const baselineClassIds = new Set(baseline.taxRates.map((r) => r.taxClassId));
  for (const row of taxRates) {
    if (baselineKeys.has(rateKey(row))) continue;
    if (!baselineClassIds.has(row.taxClassId)) continue;
    if (Date.parse(row.effectiveFrom) <= now.getTime()) {
      return 'A new rate for an existing tax class must start in the future';
    }
  }

  // Rule 9
  const activeClassIds = new Set(taxClasses.filter((c) => c.isActive).map((c) => c.id));
  const defaultTaxClassId = body.defaultTaxClassId ?? null;
  if (defaultTaxClassId !== null) {
    if (typeof defaultTaxClassId !== 'string' || !activeClassIds.has(defaultTaxClassId)) {
      return 'defaultTaxClassId must be an active tax class';
    }
  } else if (activeClassIds.size > 0) {
    return 'defaultTaxClassId is required when tax classes exist';
  }

  return { allergens, additives, taxClasses, defaultTaxClassId, taxRates };
}
