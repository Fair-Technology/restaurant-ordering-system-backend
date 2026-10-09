import { allocateByWeight } from '../order/discount';
import { roundHalfUp } from '../order/tax';

/** One choice in a combo: the diner picks exactly one of productIds. */
export interface ComboGroup {
  id: string; // stable across edits (kept when the owner's save sends it back)
  name: string; // original menu language, 1–60 characters
  productIds: string[]; // dishes (never combos) of the same restaurant, 1–50, no duplicates
}
export interface ProductCombo {
  groups: ComboGroup[]; // 1–5
  bmfDrinkShare: boolean; // BMF 30 % simplification; only for restaurants in Germany
}
export interface ComboPart {
  weightCents: number;
  isDrink: boolean;
}
export interface ComboContext {
  countryCode: string | undefined;
  categoryIds: ReadonlySet<string>; // the restaurant's live categories
  dishIds: ReadonlySet<string>; // the restaurant's non-deleted products that are not combos
  existing: ProductCombo | null; // the combo being edited, null when creating
  newId: () => string; // randomUUID in production
}
export interface ComboFields {
  name: string;
  description: string;
  price: number; // cents
  categoryIds: string[]; // exactly one
  isAvailable: boolean;
  combo: ProductCombo;
}

export const BEVERAGE_TAX_CLASS_ID = 'beverage';
export const BMF_DRINK_SHARE_PERCENT = 30;
export const MAX_COMBO_GROUPS = 5;
export const MAX_GROUP_DISHES = 50;
export const MAX_COMBO_PRICE_CENTS = 100000;

export const COMBO_NAME_ERROR = 'name must be 1 to 120 characters';
export const COMBO_DESCRIPTION_ERROR = 'description must be at most 2000 characters';
export const COMBO_PRICE_ERROR = 'priceCents must be a whole number from 1 to 100000';
export const COMBO_CATEGORY_ERROR = "categoryId must be one of the restaurant's categories";
export const COMBO_GROUPS_ERROR =
  'groups must hold 1 to 5 choices, each with a name of 1 to 60 characters and 1 to 50 dishes';
export const COMBO_DISH_ERROR = "Every dish in a combo must be one of the restaurant's dishes, and not a combo";
export const COMBO_BMF_ERROR = 'bmfDrinkShare must be true or false, and true only for restaurants in Germany';
export const COMBO_AVAILABLE_ERROR = 'isAvailable must be true or false';
export const COMBO_NOT_FOUND_ERROR = 'Combo not found';

/** Splits one combo's price over its parts by weight; leftover cents by largest remainder. Sums to unitCents. */
export function splitComboUnit(unitCents: number, parts: readonly ComboPart[], bmfDrinkShare: boolean): number[] {
  const even = (ws: number[]): number[] => (ws.every((w) => w <= 0) ? ws.map(() => 1) : ws);
  const drinks = parts.flatMap((p, i) => (p.isDrink ? [i] : []));
  const others = parts.flatMap((p, i) => (p.isDrink ? [] : [i]));
  if (bmfDrinkShare && drinks.length > 0 && others.length > 0) {
    const drinkCents = roundHalfUp(unitCents * BMF_DRINK_SHARE_PERCENT, 100);
    const out = parts.map(() => 0);
    allocateByWeight(even(drinks.map((i) => parts[i].weightCents)), drinkCents).forEach((c, k) => {
      out[drinks[k]] = c;
    });
    allocateByWeight(even(others.map((i) => parts[i].weightCents)), unitCents - drinkCents).forEach((c, k) => {
      out[others[k]] = c;
    });
    return out;
  }
  return allocateByWeight(even(parts.map((p) => p.weightCents)), unitCents);
}

/** Validates an owner's combo save (create or full replace). */
export function parseComboInput(body: Record<string, unknown>, ctx: ComboContext): ComboFields | { error: string } {
  const str = (v: unknown): string | null => (typeof v === 'string' ? v.trim() : null);
  const name = str(body.name);
  if (!name || name.length > 120) return { error: COMBO_NAME_ERROR };
  const description = body.description === undefined || body.description === null ? '' : str(body.description);
  if (description === null || description.length > 2000) return { error: COMBO_DESCRIPTION_ERROR };
  const price = body.priceCents;
  if (typeof price !== 'number' || !Number.isInteger(price) || price < 1 || price > MAX_COMBO_PRICE_CENTS) {
    return { error: COMBO_PRICE_ERROR };
  }
  if (typeof body.categoryId !== 'string' || !ctx.categoryIds.has(body.categoryId)) {
    return { error: COMBO_CATEGORY_ERROR };
  }
  const raw = body.groups;
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_COMBO_GROUPS) return { error: COMBO_GROUPS_ERROR };
  const groups: ComboGroup[] = [];
  const usedIds = new Set<string>();
  for (const g of raw as unknown[]) {
    const o = (g ?? {}) as Record<string, unknown>;
    const gName = str(o.name);
    if (
      !gName ||
      gName.length > 60 ||
      !Array.isArray(o.productIds) ||
      o.productIds.some((id) => typeof id !== 'string')
    ) {
      return { error: COMBO_GROUPS_ERROR };
    }
    const productIds = [...new Set(o.productIds as string[])];
    if (productIds.length < 1 || productIds.length > MAX_GROUP_DISHES) return { error: COMBO_GROUPS_ERROR };
    if (productIds.some((id) => !ctx.dishIds.has(id))) return { error: COMBO_DISH_ERROR };
    // An existing id is kept only the first time it appears; a repeat gets a fresh one.
    const keep = typeof o.id === 'string' && !usedIds.has(o.id) && (ctx.existing?.groups ?? []).some((e) => e.id === o.id);
    const id = keep ? (o.id as string) : ctx.newId();
    usedIds.add(id);
    groups.push({ id, name: gName, productIds });
  }
  const bmf = body.bmfDrinkShare === undefined ? false : body.bmfDrinkShare;
  if (typeof bmf !== 'boolean' || (bmf && ctx.countryCode !== 'DE')) return { error: COMBO_BMF_ERROR };
  const isAvailable = body.isAvailable === undefined ? true : body.isAvailable;
  if (typeof isAvailable !== 'boolean') return { error: COMBO_AVAILABLE_ERROR };
  return {
    name,
    description,
    price,
    categoryIds: [body.categoryId],
    isAvailable,
    combo: { groups, bmfDrinkShare: bmf },
  };
}
