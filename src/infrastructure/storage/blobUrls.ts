// Pure helpers that decide which stored links are "ours" and safe to delete.
// Reads the storage account name lazily so importing never throws.
const CONTAINER = 'product-media';
const SAFE_LEAF = /^[A-Za-z0-9-]+\.(jpg|png|webp)$/;

export const productImageFolder = (shopId: string, productId: string): string => `shops/${shopId}/products/${productId}/`;
export const shopBrandingFolder = (shopId: string): string => `shops/${shopId}/branding/`;

/** Blob path if `url` is exactly an own-storage blob URL inside `folder` with a single safe file name; else null. */
export function ownedBlobPath(url: unknown, folder: string): string | null {
  const account = process.env.STORAGE_ACCOUNT_NAME;
  if (!account || typeof url !== 'string') return null;
  const base = `https://${account}.blob.core.windows.net/${CONTAINER}/`;
  if (!url.startsWith(base)) return null;
  const path = url.slice(base.length);
  if (!path.startsWith(folder)) return null;
  return SAFE_LEAF.test(path.slice(folder.length)) ? path : null;
}
