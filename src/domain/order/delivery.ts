import type { Shop } from '../shop/Shop';
import type { ReferenceListsDoc } from '../reference/ReferenceLists';
import { resolveTaxRateBasisPoints } from '../reference/ReferenceLists';
import type { DeliveryAddress, FulfilmentMode, OrderCharge } from './Order';
import { extractVatCents } from './tax';
import { orderSettingsOf, type DeliveryZone, type StoredOrderSettings, type WeeklyHours } from './orderSettings';

export const MAX_DELIVERY_ZONES = 200;
export const MAX_DELIVERY_FEE_CENTS = 10_000; // 100,00 €
export const MAX_DELIVERY_MIN_ORDER_CENTS = 100_000; // 1.000,00 €
const MAX_ADDRESS_FIELD_CHARS = 200;

/** Trims, removes every space, upper-cases. null when not a string or empty afterwards. */
export function normalisePostcode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const p = raw.replace(/\s+/g, '').toUpperCase();
  return p === '' ? null : p;
}

/** Germany: exactly five digits. Elsewhere: 3–10 letters, digits or dashes. Expects a normalised postcode. */
export function isValidPostcode(postcode: string, countryCode: string): boolean {
  return countryCode.toUpperCase() === 'DE' ? /^\d{5}$/.test(postcode) : /^[A-Z0-9-]{3,10}$/.test(postcode);
}

function isCents(v: unknown, max: number): boolean {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max;
}

/** The stored zone list, or 'invalid' (bad shape, bad postcode, duplicate postcode, amounts out of range, > 200). */
export function parseDeliveryZones(value: unknown, countryCode: string): DeliveryZone[] | 'invalid' {
  if (!Array.isArray(value) || value.length > MAX_DELIVERY_ZONES) return 'invalid';
  const seen = new Set<string>();
  const out: DeliveryZone[] = [];
  for (const z of value) {
    if (!z || typeof z !== 'object' || Array.isArray(z)) return 'invalid';
    const { postcode, feeCents, minOrderCents } = z as Record<string, unknown>;
    const p = normalisePostcode(postcode);
    if (!p || !isValidPostcode(p, countryCode) || seen.has(p)) return 'invalid';
    if (!isCents(feeCents, MAX_DELIVERY_FEE_CENTS) || !isCents(minOrderCents, MAX_DELIVERY_MIN_ORDER_CENTS)) return 'invalid';
    seen.add(p);
    out.push({ postcode: p, feeCents: feeCents as number, minOrderCents: minOrderCents as number });
  }
  return out;
}

/** The zone for a postcode the diner typed, or null. */
export function findDeliveryZone(shop: { orderSettings?: StoredOrderSettings | null }, rawPostcode: unknown): DeliveryZone | null {
  const p = normalisePostcode(rawPostcode);
  return p ? (orderSettingsOf(shop).deliveryZones.find((z) => z.postcode === p) ?? null) : null;
}

/** Opening hours that apply to this mode: delivery's own hours when set, else the restaurant's. */
export function hoursForMode(shop: Pick<Shop, 'openingHours' | 'orderSettings'>, mode: FulfilmentMode): WeeklyHours {
  const own = mode === 'delivery' ? orderSettingsOf(shop).deliveryHours : null;
  return own ?? shop.openingHours;
}

/** The fee as a charge at the rate of the restaurant's chosen class for delivery; null for a free delivery. */
export function deliveryFeeCharge(
  shop: { orderSettings?: StoredOrderSettings | null },
  zone: DeliveryZone,
  refs: Pick<ReferenceListsDoc, 'taxRates' | 'defaultTaxClassId'>,
  now: Date,
): OrderCharge | null {
  if (zone.feeCents === 0) return null;
  const taxClassId = orderSettingsOf(shop).deliveryFeeTaxClassId ?? refs.defaultTaxClassId;
  const rate = taxClassId ? (resolveTaxRateBasisPoints(refs.taxRates, taxClassId, 'delivery', now) ?? 0) : 0;
  return {
    kind: 'delivery_fee',
    grossCents: zone.feeCents,
    taxClassId,
    taxRateBasisPoints: rate,
    taxCents: extractVatCents(zone.feeCents, rate),
  };
}

export function chargesTotalCents(charges: ReadonlyArray<OrderCharge> | undefined): number {
  return (charges ?? []).reduce((s, c) => s + c.grossCents, 0);
}

/** The trimmed delivery address, or null when any field is missing, empty or too long. */
export function cleanDeliveryAddress(value: unknown): DeliveryAddress | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const street = typeof v.street === 'string' ? v.street.trim() : '';
  const city = typeof v.city === 'string' ? v.city.trim() : '';
  const postcode = normalisePostcode(v.postcode);
  if (!street || !city || !postcode || street.length > MAX_ADDRESS_FIELD_CHARS || city.length > MAX_ADDRESS_FIELD_CHARS || postcode.length > 10) {
    return null;
  }
  return { street, postcode, city };
}

/** For the activity log: postcodes are business data, not personal. */
export function describeDeliveryZones(zones: ReadonlyArray<DeliveryZone>): string {
  return zones.length === 0 ? 'none' : zones.map((z) => z.postcode).join(', ');
}
