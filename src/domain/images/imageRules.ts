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

/** Storefront shows a logo whole, up to 320 x 48 CSS px (§16); stored at 2x for retina. Never cropped. */
export const LOGO_MAX_SIZE: ExactImageSize = { width: 640, height: 96 };

/** Dish photo card variant: shop-page grid thumbnail at up to ~2x DPR of the ~291x218 CSS px slot. */
export const PRODUCT_IMAGE_CARD_SIZE: ExactImageSize = { width: 800, height: 600 };
/** Dish photo thumb variant: smallest grid/list context. */
export const PRODUCT_IMAGE_THUMB_SIZE: ExactImageSize = { width: 400, height: 300 };
/** Shop cover card variant: shop-listing card banner, half the hero resolution. */
export const COVER_IMAGE_CARD_SIZE: ExactImageSize = { width: 960, height: 320 };
/** Shop logo thumb variant: small square-ish badge contexts (e.g. a ~77x77 CSS px home-card badge). */
export const LOGO_THUMB_SIZE: ExactImageSize = { width: 160, height: 160 };

/**
 * Path of a derived variant blob: the suffix goes before the extension, so
 * `shops/s1/products/p1/abc.jpg` + `thumb` -> `shops/s1/products/p1/abc-thumb.jpg`.
 */
export function variantSuffix(path: string, suffix: string): string {
  const dot = path.lastIndexOf('.');
  return `${path.slice(0, dot)}-${suffix}${path.slice(dot)}`;
}

/** Smallest source (after EXIF orientation) the server will resize; smaller is refused, never upscaled. */
export const COVER_IMAGE_MIN_SOURCE: ExactImageSize = { width: 1200, height: 400 };
export const DISH_IMAGE_MIN_SOURCE: ExactImageSize = { width: 800, height: 600 };

export const COVER_IMAGE_WRONG_SIZE = 'COVER_IMAGE_WRONG_SIZE';
export const PRODUCT_IMAGE_WRONG_SIZE = 'PRODUCT_IMAGE_WRONG_SIZE';

export function tooSmallMessage(what: string, min: ExactImageSize): string {
  return `${what} source must be at least ${min.width} x ${min.height} px`;
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
