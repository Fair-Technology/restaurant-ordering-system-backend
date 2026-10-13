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

/**
 * A dish's new image list may name photos by id (and url) only: fill in everything else (createdAt, alt, sortOrder)
 * from the photo already stored under that id, so shrinking the list never strips a photo's details.
 */
export function mergeProductImages<T extends { id: string }>(existing: readonly T[] | undefined, requested: readonly T[]): T[] {
  const byId = new Map((existing ?? []).map((img) => [img.id, img]));
  return requested.map((img) => ({ ...byId.get(img.id), ...img }));
}

/** Largest file the check step accepts (same as the admin's IMAGE_MAX_BYTES). */
export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Allowed file extensions with the declared type and the real format (first bytes) each must have. */
export const IMAGE_FORMAT_BY_EXTENSION: Readonly<Record<string, { contentType: string; format: string }>> = {
  '.jpg': { contentType: 'image/jpeg', format: 'jpg' },
  '.png': { contentType: 'image/png', format: 'png' },
  '.webp': { contentType: 'image/webp', format: 'webp' },
};

export const CREATE_WITH_PHOTOS_ERROR = 'Photos cannot be sent when creating a dish. Create the dish first, then upload its photo';
export const PHOTO_NOT_UPLOADED_ERROR = 'New photos must be added through the photo upload, not by sending a link';
export const PHOTO_URL_CHANGED_ERROR = "A photo's link cannot be changed. Upload a new photo instead";

export function tooLargeMessage(what: string): string {
  return `${what} must be at most 10 MB`;
}

export function wrongTypeMessage(what: string): string {
  return `${what} must be a JPEG, PNG or WebP image`;
}

/** null when every requested image names a stored image by id and keeps its url; else the error text. */
export function unknownOrChangedImage(
  existing: readonly { id: string; url: string }[] | undefined,
  requested: readonly { id: string; url?: string }[],
): string | null {
  const byId = new Map((existing ?? []).map((i) => [i.id, i]));
  for (const img of requested) {
    const stored = img && typeof img.id === 'string' ? byId.get(img.id) : undefined;
    if (!stored) return PHOTO_NOT_UPLOADED_ERROR;
    if (img.url !== undefined && img.url !== stored.url) return PHOTO_URL_CHANGED_ERROR;
  }
  return null;
}
