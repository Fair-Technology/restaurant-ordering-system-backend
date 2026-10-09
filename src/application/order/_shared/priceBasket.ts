import type { Category } from '../../../domain/category/Category';
import { localize, menuLanguagesOf } from '../../../domain/menu/menuLanguage';
import type { FulfilmentMode, OrderItem, TaxBreakdownEntry } from '../../../domain/order/Order';
import { COMBO_CHOICES_ERROR } from '../../../domain/order/orderErrors';
import { buildTaxBreakdown, effectiveTaxClassId, extractVatCents } from '../../../domain/order/tax';
import { BEVERAGE_TAX_CLASS_ID, splitComboUnit } from '../../../domain/product/combo';
import { isDeclared, Product } from '../../../domain/product/Product';
import { MenuLanguage, ReferenceListsDoc, resolveTaxRateBasisPoints } from '../../../domain/reference/ReferenceLists';
import type { Shop } from '../../../domain/shop/Shop';
import { isProductScheduleActive } from '../../_shared/scheduleUtils';

export interface ComboChoiceInput {
  groupId: string;
  productId: string;
  selectedVariantOptionId?: string;
  selectedAddonOptionIds?: string[];
}

export interface BasketItemInput {
  productId: string;
  quantity: number;
  selectedVariantOptionId?: string;
  selectedAddonOptionIds?: string[];
  expectedUnitPriceCents?: number;
  comboChoices?: ComboChoiceInput[]; // only for a combo
}

export type LineStatus = 'ok' | 'price_changed' | 'unavailable' | 'invalid_options';

export interface PricedLine {
  index: number;
  status: LineStatus;
  productId: string;
  displayName: string | null;
  item: OrderItem | null; // a dish's line; null for a combo and for a rejected line
  components: OrderItem[] | null; // a combo's lines, one per picked dish; null otherwise
  unitPriceCents: number | null; // what one unit costs (dish or whole combo); null when rejected
  lineTotalCents: number | null; // unitPriceCents × quantity; null when rejected
  expectedUnitPriceCents: number | null;
}

export interface PricedBasket {
  lines: PricedLine[];
  items: OrderItem[];
  subtotalCents: number;
  taxBreakdown: TaxBreakdownEntry[];
  allOk: boolean;
}

export const MAX_LINE_QUANTITY = 99;
export const MAX_COMBO_CHOICES = 10;

/** Every product a basket names: each line's product plus every dish picked inside a combo. */
export function basketProductIds(items: readonly BasketItemInput[]): string[] {
  return items.flatMap((i) => [i.productId, ...(i.comboChoices ?? []).map((c) => c.productId)]);
}

/** Returns the first problem with the basket's shape, or null when it is well-formed. */
export function validateBasketItems(items: unknown): string | null {
  if (!Array.isArray(items) || items.length === 0) return 'items must be a non-empty array';
  for (let i = 0; i < items.length; i++) {
    const item = items[i] as Record<string, unknown> | null;
    if (!item || typeof item.productId !== 'string' || !item.productId) return `items[${i}].productId is required`;
    const q = item.quantity;
    if (typeof q !== 'number' || !Number.isInteger(q) || q < 1 || q > MAX_LINE_QUANTITY) {
      return `items[${i}].quantity must be a positive integer`;
    }
    const expected = item.expectedUnitPriceCents;
    if (expected !== undefined && (typeof expected !== 'number' || !Number.isInteger(expected) || expected < 0)) {
      return `items[${i}].expectedUnitPriceCents must be a whole number of cents`;
    }
    const choices = item.comboChoices;
    if (choices !== undefined) {
      const bad = (c: unknown): boolean => {
        const o = c as Record<string, unknown> | null;
        return (
          !o ||
          typeof o !== 'object' ||
          typeof o.groupId !== 'string' ||
          !o.groupId ||
          typeof o.productId !== 'string' ||
          !o.productId ||
          (o.selectedVariantOptionId !== undefined && typeof o.selectedVariantOptionId !== 'string') ||
          (o.selectedAddonOptionIds !== undefined &&
            (!Array.isArray(o.selectedAddonOptionIds) || o.selectedAddonOptionIds.some((x) => typeof x !== 'string')))
        );
      };
      if (!Array.isArray(choices) || choices.length === 0 || choices.length > MAX_COMBO_CHOICES || choices.some(bad)) {
        return `items[${i}].${COMBO_CHOICES_ERROR}`;
      }
    }
  }
  return null;
}

/** The dish's own price: its offer price when it has a valid one (whole cents, below the normal price). */
export function activeBasePriceCents(p: Pick<Product, 'price' | 'schedule'>): number {
  const offer = p.schedule?.offerPrice;
  return typeof offer === 'number' && Number.isInteger(offer) && offer > 0 && offer < p.price ? offer : p.price;
}

function isOrderable(p: Product | undefined, mode: FulfilmentMode, timezone: string, now: Date): p is Product {
  return (
    !!p &&
    !p.isDeleted &&
    p.isAvailable &&
    isDeclared(p) &&
    !(p.unavailableModes ?? []).includes(mode) &&
    !(p.schedule && !isProductScheduleActive(p.schedule, timezone, now))
  );
}

interface Selection {
  unitPriceCents: number;
  variantName?: string;
  addonNames?: string[];
}

/** A dish's price with the chosen size and extras, or why the choice is not valid. */
function priceSelection(
  p: Product,
  variantId: string | undefined,
  addonIdsIn: string[] | undefined,
): Selection | 'unavailable' | 'invalid_options' {
  // The schedule window is also the offer window, and a dish outside it was rejected before, so reaching
  // here with an offer price means the offer is on. Size and extra surcharges are added on top unchanged.
  let unitPriceCents = activeBasePriceCents(p);
  let variantName: string | undefined;
  if (variantId) {
    const option = (p.variantGroups ?? []).flatMap((g) => g.options).find((o) => o.id === variantId);
    if (!option || !option.isAvailable) return 'unavailable';
    unitPriceCents += option.priceDelta;
    variantName = option.name;
  }

  const addonIds = Array.isArray(addonIdsIn) ? addonIdsIn : [];
  if (new Set(addonIds).size !== addonIds.length) return 'invalid_options';
  const addonNames: string[] = [];
  for (const id of addonIds) {
    const option = (p.addonGroups ?? []).flatMap((g) => g.options).find((o) => o.id === id);
    if (!option || !option.isAvailable) return 'unavailable';
    unitPriceCents += option.priceDelta;
    addonNames.push(option.name);
  }
  for (const group of p.addonGroups ?? []) {
    const count = group.options.filter((o) => addonIds.includes(o.id)).length;
    if (count < group.minSelectable || count > group.maxSelectable) return 'invalid_options';
  }
  return { unitPriceCents, variantName, addonNames: addonNames.length > 0 ? addonNames : undefined };
}

/**
 * Re-prices a basket from the live menu. Never trusts client amounts: `expectedUnitPriceCents` is only
 * compared against the server price so the diner can be shown what changed.
 */
export function priceBasket(input: {
  items: BasketItemInput[];
  products: Map<string, Product>;
  categories: Category[];
  refs: ReferenceListsDoc;
  shop: Pick<Shop, 'timezone' | 'menuLanguages' | 'countryCode'>;
  mode: FulfilmentMode;
  now: Date;
  language: MenuLanguage;
}): PricedBasket {
  const { products, categories, refs, shop, mode, now, language } = input;
  const originalLanguage = menuLanguagesOf(shop)[0];
  const lines: PricedLine[] = input.items.map((entry, index) => {
    const base = { index, productId: entry.productId, expectedUnitPriceCents: entry.expectedUnitPriceCents ?? null };
    const p = products.get(entry.productId);
    const displayName = p ? localize(p.name, p.nameTranslations, language, originalLanguage) : null;
    const reject = (status: LineStatus): PricedLine => ({
      ...base,
      status,
      displayName,
      item: null,
      components: null,
      unitPriceCents: null,
      lineTotalCents: null,
    });

    if (!isOrderable(p, mode, shop.timezone, now)) return reject('unavailable');

    if (p.combo) {
      if (entry.selectedVariantOptionId || (entry.selectedAddonOptionIds ?? []).length > 0) return reject('invalid_options');
      const choices = entry.comboChoices ?? [];
      if (choices.length !== p.combo.groups.length) return reject('invalid_options');
      const parts: Array<{ dish: Product; sel: Selection; choice: ComboChoiceInput; classId: string | null; rate: number }> = [];
      for (const group of p.combo.groups) {
        const picked = choices.filter((c) => c.groupId === group.id);
        if (picked.length !== 1 || !group.productIds.includes(picked[0].productId)) return reject('invalid_options');
        const dish = products.get(picked[0].productId);
        if (dish?.combo) return reject('invalid_options');
        if (!isOrderable(dish, mode, shop.timezone, now)) return reject('unavailable');
        const sel = priceSelection(dish, picked[0].selectedVariantOptionId, picked[0].selectedAddonOptionIds);
        if (typeof sel === 'string') return reject(sel);
        const classId = effectiveTaxClassId(dish, categories, refs.defaultTaxClassId);
        const rate = classId ? (resolveTaxRateBasisPoints(refs.taxRates, classId, mode, now) ?? 0) : 0;
        parts.push({ dish, sel, choice: picked[0], classId, rate });
      }
      // The combo price plus every size and extra surcharge, split over the dishes by what each costs on its own.
      const unitPriceCents =
        activeBasePriceCents(p) + parts.reduce((sum, x) => sum + x.sel.unitPriceCents - activeBasePriceCents(x.dish), 0);
      if (unitPriceCents < 0) return reject('invalid_options');
      const shares = splitComboUnit(
        unitPriceCents,
        parts.map((x) => ({ weightCents: x.sel.unitPriceCents, isDrink: x.classId === BEVERAGE_TAX_CLASS_ID })),
        p.combo.bmfDrinkShare,
      );
      const components: OrderItem[] = parts.map((x, k) => {
        const lineTotalCents = shares[k] * entry.quantity;
        return {
          productId: x.dish.id,
          productName: `${p.name}: ${x.dish.name}`,
          quantity: entry.quantity,
          unitPriceCents: shares[k],
          selectedVariantOptionId: x.choice.selectedVariantOptionId,
          selectedVariantOptionName: x.sel.variantName,
          selectedAddonOptionIds: x.choice.selectedAddonOptionIds,
          selectedAddonOptionNames: x.sel.addonNames,
          lineTotalCents,
          taxClassId: x.classId,
          taxRateBasisPoints: x.rate,
          taxCents: extractVatCents(lineTotalCents, x.rate),
          combo: { line: index, productId: p.id, name: p.name },
        };
      });
      const changed = entry.expectedUnitPriceCents !== undefined && entry.expectedUnitPriceCents !== unitPriceCents;
      return {
        ...base,
        status: changed ? 'price_changed' : 'ok',
        displayName,
        item: null,
        components,
        unitPriceCents,
        lineTotalCents: unitPriceCents * entry.quantity,
      };
    }

    const sel = priceSelection(p, entry.selectedVariantOptionId, entry.selectedAddonOptionIds);
    if (typeof sel === 'string') return reject(sel);
    const unitPriceCents = sel.unitPriceCents;
    const lineTotalCents = unitPriceCents * entry.quantity;
    const taxClassId = effectiveTaxClassId(p, categories, refs.defaultTaxClassId);
    const rate = taxClassId ? (resolveTaxRateBasisPoints(refs.taxRates, taxClassId, mode, now) ?? 0) : 0;
    const item: OrderItem = {
      productId: p.id,
      productName: p.name,
      quantity: entry.quantity,
      unitPriceCents,
      selectedVariantOptionId: entry.selectedVariantOptionId,
      selectedVariantOptionName: sel.variantName,
      selectedAddonOptionIds: entry.selectedAddonOptionIds,
      selectedAddonOptionNames: sel.addonNames,
      lineTotalCents,
      taxClassId,
      taxRateBasisPoints: rate,
      taxCents: extractVatCents(lineTotalCents, rate),
    };
    const changed = entry.expectedUnitPriceCents !== undefined && entry.expectedUnitPriceCents !== unitPriceCents;
    return {
      ...base,
      status: changed ? 'price_changed' : 'ok',
      displayName,
      item,
      components: null,
      unitPriceCents,
      lineTotalCents,
    };
  });

  const items = lines.flatMap((l) => (l.item ? [l.item] : (l.components ?? [])));
  return {
    lines,
    items,
    subtotalCents: items.reduce((sum, i) => sum + i.lineTotalCents, 0),
    taxBreakdown: buildTaxBreakdown(items),
    allOk: lines.every((l) => l.status === 'ok'),
  };
}
