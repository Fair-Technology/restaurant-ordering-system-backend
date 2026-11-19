export const PRODUCT_NAME_ERROR = 'name is required and must be a non-empty string';
export const PRODUCT_DESCRIPTION_ERROR = 'description is required and must be a string';

/** True when `value` is a string with at least one non-whitespace character. */
export function isValidProductName(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/** True when `value` is a non-empty string (whitespace-only is allowed, matching create). */
export function isValidProductDescription(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}
