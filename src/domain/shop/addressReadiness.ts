import type { Shop } from './Shop';
import { countryRequiresState } from '../reference/subdivisions';

/**
 * Whether a shop's address is complete enough to go live (SPECS §16). Shared by the
 * go-live checklist and the go-live gate so they cannot drift. `state` is only
 * required where the country's address has one.
 */
export function isShopAddressComplete(
  address: Shop['address'] | undefined | null,
  countryCode: string | undefined | null,
): boolean {
  const addr = address ?? {};
  const base =
    !!addr.street?.trim() &&
    !!addr.city?.trim() &&
    !!addr.postcode?.trim() &&
    !!addr.country?.trim();
  if (!base) return false;
  return countryRequiresState(countryCode) ? !!addr.state?.trim() : true;
}

/** The go-live checklist description for this country's address rule. */
export function shopAddressRequirement(countryCode: string | undefined | null): string {
  return countryRequiresState(countryCode)
    ? 'Full address is filled in (street, city, state, postcode, country)'
    : 'Full address is filled in (street, city, postcode, country)';
}

/** True when any of street/city/state/postcode/country differs (trimmed) between two addresses. */
export function addressFieldsChanged(
  a: Shop['address'] | undefined | null,
  b: Shop['address'] | undefined | null,
): boolean {
  const norm = (v: string | undefined) => (v ?? '').trim();
  const keys: Array<keyof NonNullable<Shop['address']>> = ['street', 'city', 'state', 'postcode', 'country'];
  return keys.some((k) => norm(a?.[k]) !== norm(b?.[k]));
}
