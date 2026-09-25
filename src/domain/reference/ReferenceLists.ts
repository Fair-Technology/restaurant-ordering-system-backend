import { FulfilmentMode } from '../order/Order';

export type MenuLanguage = 'de' | 'en';

export const SUPPORTED_MENU_LANGUAGES: readonly MenuLanguage[] = ['de', 'en'];

export type LocalizedLabel = Record<MenuLanguage, string>;

export interface AllergenDef {
  id: string;
  labels: LocalizedLabel;
  isActive: boolean;
}

export interface AdditiveDef {
  id: string;
  code: number;
  labels: LocalizedLabel;
  isActive: boolean;
}

export interface TaxClassDef {
  id: string;
  labels: LocalizedLabel;
  isActive: boolean;
}

export interface TaxRateRow {
  taxClassId: string;
  fulfilmentMode: FulfilmentMode;
  rateBasisPoints: number; // 700 = 7 %
  effectiveFrom: string; // ISO 8601 with offset, e.g. '2026-01-01T00:00:00+01:00'
}

export interface ReferenceListsDoc {
  id: string; // 'reference_lists:DE'
  countryCode: string; // upper-case ISO alpha-2
  allergens: AllergenDef[];
  additives: AdditiveDef[];
  taxClasses: TaxClassDef[];
  defaultTaxClassId: string | null;
  taxRates: TaxRateRow[];
  updatedAt: string | null;
  updatedBy: string | null;
}

export function referenceListsId(countryCode: string): string {
  return `reference_lists:${countryCode.toUpperCase()}`;
}

export const DE_REFERENCE_LISTS: ReferenceListsDoc = {
  id: 'reference_lists:DE',
  countryCode: 'DE',
  allergens: [
    { id: 'gluten', labels: { de: 'Glutenhaltiges Getreide', en: 'Cereals containing gluten' }, isActive: true },
    { id: 'crustaceans', labels: { de: 'Krebstiere', en: 'Crustaceans' }, isActive: true },
    { id: 'eggs', labels: { de: 'Eier', en: 'Eggs' }, isActive: true },
    { id: 'fish', labels: { de: 'Fisch', en: 'Fish' }, isActive: true },
    { id: 'peanuts', labels: { de: 'Erdnüsse', en: 'Peanuts' }, isActive: true },
    { id: 'soybeans', labels: { de: 'Soja', en: 'Soybeans' }, isActive: true },
    { id: 'milk', labels: { de: 'Milch (einschließlich Laktose)', en: 'Milk (including lactose)' }, isActive: true },
    { id: 'tree_nuts', labels: { de: 'Schalenfrüchte (Nüsse)', en: 'Tree nuts' }, isActive: true },
    { id: 'celery', labels: { de: 'Sellerie', en: 'Celery' }, isActive: true },
    { id: 'mustard', labels: { de: 'Senf', en: 'Mustard' }, isActive: true },
    { id: 'sesame', labels: { de: 'Sesamsamen', en: 'Sesame seeds' }, isActive: true },
    { id: 'sulphites', labels: { de: 'Schwefeldioxid und Sulfite', en: 'Sulphur dioxide and sulphites' }, isActive: true },
    { id: 'lupin', labels: { de: 'Lupinen', en: 'Lupin' }, isActive: true },
    { id: 'molluscs', labels: { de: 'Weichtiere', en: 'Molluscs' }, isActive: true },
  ],
  additives: [
    { id: 'colouring', code: 1, labels: { de: 'mit Farbstoff', en: 'with colouring' }, isActive: true },
    { id: 'preservative', code: 2, labels: { de: 'mit Konservierungsstoff', en: 'with preservative' }, isActive: true },
    { id: 'antioxidant', code: 3, labels: { de: 'mit Antioxidationsmittel', en: 'with antioxidant' }, isActive: true },
    { id: 'flavour_enhancer', code: 4, labels: { de: 'mit Geschmacksverstärker', en: 'with flavour enhancer' }, isActive: true },
    { id: 'sulphured', code: 5, labels: { de: 'geschwefelt', en: 'sulphured' }, isActive: true },
    { id: 'blackened', code: 6, labels: { de: 'geschwärzt', en: 'blackened' }, isActive: true },
    { id: 'waxed', code: 7, labels: { de: 'gewachst', en: 'waxed' }, isActive: true },
    { id: 'phosphate', code: 8, labels: { de: 'mit Phosphat', en: 'with phosphate' }, isActive: true },
    { id: 'sweetener', code: 9, labels: { de: 'mit Süßungsmittel', en: 'with sweetener' }, isActive: true },
    { id: 'phenylalanine', code: 10, labels: { de: 'enthält eine Phenylalaninquelle', en: 'contains a source of phenylalanine' }, isActive: true },
    { id: 'caffeine', code: 11, labels: { de: 'koffeinhaltig', en: 'contains caffeine' }, isActive: true },
    { id: 'quinine', code: 12, labels: { de: 'chininhaltig', en: 'contains quinine' }, isActive: true },
    { id: 'taurine', code: 13, labels: { de: 'taurinhaltig', en: 'contains taurine' }, isActive: true },
  ],
  taxClasses: [
    { id: 'food', labels: { de: 'Speisen', en: 'Food' }, isActive: true },
    { id: 'beverage', labels: { de: 'Getränke', en: 'Beverages' }, isActive: true },
  ],
  defaultTaxClassId: 'food',
  taxRates: [
    { taxClassId: 'food', fulfilmentMode: 'collection', rateBasisPoints: 700, effectiveFrom: '2026-01-01T00:00:00+01:00' },
    { taxClassId: 'food', fulfilmentMode: 'delivery', rateBasisPoints: 700, effectiveFrom: '2026-01-01T00:00:00+01:00' },
    { taxClassId: 'food', fulfilmentMode: 'dine_in', rateBasisPoints: 700, effectiveFrom: '2026-01-01T00:00:00+01:00' },
    { taxClassId: 'beverage', fulfilmentMode: 'collection', rateBasisPoints: 1900, effectiveFrom: '2026-01-01T00:00:00+01:00' },
    { taxClassId: 'beverage', fulfilmentMode: 'delivery', rateBasisPoints: 1900, effectiveFrom: '2026-01-01T00:00:00+01:00' },
    { taxClassId: 'beverage', fulfilmentMode: 'dine_in', rateBasisPoints: 1900, effectiveFrom: '2026-01-01T00:00:00+01:00' },
  ],
  updatedAt: null,
  updatedBy: null,
};

export function defaultReferenceLists(countryCode: string): ReferenceListsDoc {
  const cc = countryCode.toUpperCase();
  if (cc === 'DE') return structuredClone(DE_REFERENCE_LISTS);
  return {
    id: referenceListsId(cc),
    countryCode: cc,
    allergens: [],
    additives: [],
    taxClasses: [],
    defaultTaxClassId: null,
    taxRates: [],
    updatedAt: null,
    updatedBy: null,
  };
}

export function resolveTaxRateBasisPoints(
  rows: readonly TaxRateRow[],
  taxClassId: string,
  mode: FulfilmentMode,
  at: Date,
): number | null {
  const t = at.getTime();
  let best: TaxRateRow | null = null;
  let bestFrom = -Infinity;
  for (const r of rows) {
    if (r.taxClassId !== taxClassId || r.fulfilmentMode !== mode) continue;
    const from = Date.parse(r.effectiveFrom);
    if (Number.isNaN(from) || from > t) continue;
    if (from > bestFrom) {
      best = r;
      bestFrom = from;
    }
  }
  return best ? best.rateBasisPoints : null;
}

export interface CurrentTaxRate {
  taxClassId: string;
  rates: Record<FulfilmentMode, number | null>;
}

export function currentTaxRates(doc: ReferenceListsDoc, at: Date): CurrentTaxRate[] {
  return doc.taxClasses.map((c) => ({
    taxClassId: c.id,
    rates: {
      collection: resolveTaxRateBasisPoints(doc.taxRates, c.id, 'collection', at),
      delivery: resolveTaxRateBasisPoints(doc.taxRates, c.id, 'delivery', at),
      dine_in: resolveTaxRateBasisPoints(doc.taxRates, c.id, 'dine_in', at),
    },
  }));
}

export function ratesUniformAcrossModes(current: readonly CurrentTaxRate[]): boolean {
  return current.every((c) => c.rates.collection === c.rates.delivery && c.rates.delivery === c.rates.dine_in);
}
