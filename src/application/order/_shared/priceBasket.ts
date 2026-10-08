import type { Category } from '../../../domain/category/Category';
import { localize, menuLanguagesOf } from '../../../domain/menu/menuLanguage';
import type { FulfilmentMode, OrderItem, TaxBreakdownEntry } from '../../../domain/order/Order';
import { buildTaxBreakdown, effectiveTaxClassId, extractVatCents } from '../../../domain/order/tax';
import { isDeclared, Product } from '../../../domain/product/Product';
import { MenuLanguage, ReferenceListsDoc, resolveTaxRateBasisPoints } from '../../../domain/reference/ReferenceLists';
import type { Shop } from '../../../domain/shop/Shop';
import { isProductScheduleActive } from '../../_shared/scheduleUtils';

export interface BasketItemInput {
  productId: string;
  quantity: number;
  selectedVariantOptionId?: string;
  selectedAddonOptionIds?: string[];
  expectedUnitPriceCents?: number;
}

export type LineStatus = 'ok' | 'price_changed' | 'unavailable' | 'invalid_options';

export interface PricedLine {
  index: number;
  status: LineStatus;
  productId: string;
  displayName: string | null;
  item: OrderItem | null;
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
  }
  return null;
}

/** The dish's own price: its offer price when it has a valid one (whole cents, below the normal price). */
export function activeBasePriceCents(p: Pick<Product, 'price' | 'schedule'>): number {
  const offer = p.schedule?.offerPrice;
  return typeof offer === 'number' && Number.isInteger(offer) && offer > 0 && offer < p.price ? offer : p.price;
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
    const reject = (status: LineStatus): PricedLine => ({ ...base, status, displayName, item: null });

    if (
      !p ||
      p.isDeleted ||
      !p.isAvailable ||
      !isDeclared(p) ||
      (p.unavailableModes ?? []).includes(mode) ||
      (p.schedule && !isProductScheduleActive(p.schedule, shop.timezone, now))
    ) {
      return reject('unavailable');
    }

    // The schedule window is also the offer window, and a dish outside it was rejected above, so reaching
    // here with an offer price means the offer is on. Size and extra surcharges are added on top unchanged.
    let unitPriceCents = activeBasePriceCents(p);
    let variantName: string | undefined;
    if (entry.selectedVariantOptionId) {
      const option = (p.variantGroups ?? []).flatMap((g) => g.options).find((o) => o.id === entry.selectedVariantOptionId);
      if (!option || !option.isAvailable) return reject('unavailable');
      unitPriceCents += option.priceDelta;
      variantName = option.name;
    }

    const addonIds = Array.isArray(entry.selectedAddonOptionIds) ? entry.selectedAddonOptionIds : [];
    if (new Set(addonIds).size !== addonIds.length) return reject('invalid_options');
    const addonNames: string[] = [];
    for (const id of addonIds) {
      const option = (p.addonGroups ?? []).flatMap((g) => g.options).find((o) => o.id === id);
      if (!option || !option.isAvailable) return reject('unavailable');
      unitPriceCents += option.priceDelta;
      addonNames.push(option.name);
    }
    for (const group of p.addonGroups ?? []) {
      const count = group.options.filter((o) => addonIds.includes(o.id)).length;
      if (count < group.minSelectable || count > group.maxSelectable) return reject('invalid_options');
    }

    const lineTotalCents = unitPriceCents * entry.quantity;
    const taxClassId = effectiveTaxClassId(p, categories, refs.defaultTaxClassId);
    const rate = taxClassId ? (resolveTaxRateBasisPoints(refs.taxRates, taxClassId, mode, now) ?? 0) : 0;
    const item: OrderItem = {
      productId: p.id,
      productName: p.name,
      quantity: entry.quantity,
      unitPriceCents,
      selectedVariantOptionId: entry.selectedVariantOptionId,
      selectedVariantOptionName: variantName,
      selectedAddonOptionIds: entry.selectedAddonOptionIds,
      selectedAddonOptionNames: addonNames.length > 0 ? addonNames : undefined,
      lineTotalCents,
      taxClassId,
      taxRateBasisPoints: rate,
      taxCents: extractVatCents(lineTotalCents, rate),
    };
    const changed = entry.expectedUnitPriceCents !== undefined && entry.expectedUnitPriceCents !== unitPriceCents;
    return { ...base, status: changed ? 'price_changed' : 'ok', displayName, item };
  });

  const items = lines.flatMap((l) => (l.item ? [l.item] : []));
  return {
    lines,
    items,
    subtotalCents: items.reduce((sum, i) => sum + i.lineTotalCents, 0),
    taxBreakdown: buildTaxBreakdown(items),
    allOk: lines.every((l) => l.status === 'ok'),
  };
}
