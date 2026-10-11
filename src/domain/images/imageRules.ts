// The one place that says what pixel size an uploaded image must have.
// The admin crops to exactly these sizes before uploading; the backend refuses anything else.
export interface ExactImageSize {
  width: number;
  height: number;
}

/** Shop cover (storefront banner): ratio 3:1. */
export const COVER_IMAGE_SIZE: ExactImageSize = { width: 1920, height: 640 };

/** Dish photo: ratio 4:3. */
export const PRODUCT_IMAGE_SIZE: ExactImageSize = { width: 1200, height: 900 };

export const COVER_IMAGE_WRONG_SIZE = 'COVER_IMAGE_WRONG_SIZE';
export const PRODUCT_IMAGE_WRONG_SIZE = 'PRODUCT_IMAGE_WRONG_SIZE';

export function isExactSize(actual: ExactImageSize, expected: ExactImageSize): boolean {
  return actual.width === expected.width && actual.height === expected.height;
}

export function wrongSizeMessage(what: string, expected: ExactImageSize): string {
  return `${what} must be exactly ${expected.width} x ${expected.height} px`;
}

/** A dish that has a photo must keep one: an update may not empty its image list. */
export const PRODUCT_IMAGE_REQUIRED = 'PRODUCT_IMAGE_REQUIRED';

export function wouldRemoveLastProductImage(
  existing: readonly unknown[] | undefined,
  requested: readonly unknown[] | undefined,
): boolean {
  return requested !== undefined && (existing?.length ?? 0) > 0 && requested.length === 0;
}
