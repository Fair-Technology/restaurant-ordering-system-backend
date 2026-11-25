export const PRODUCT_NAME_ERROR = 'name is required and must be a non-empty string';
export const PRODUCT_DESCRIPTION_ERROR = 'description must be a string when provided';

/** True when `value` is a string with at least one non-whitespace character. */
export function isValidProductName(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/** True when `value` is a string (empty and whitespace-only included) or `undefined` (omitted); any other type is rejected. */
export function isValidProductDescription(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}
