/**
 * Download an Unsplash demo photo, run it through the same normalisation real dish uploads get, and store it in
 * our own `product-media` blob container. Used by `seed.ts` and `migrateUnsplashImagesToBlob.ts`, so a demo shop
 * never hot-links a third party and a dead photo fails loudly instead of being stored as a broken reference.
 *
 * The Cosmos/storage modules read env at load time, so they are only required lazily by `defaultDeps()`.
 */
import * as https from 'https';
import { normalizeImage } from '../src/infrastructure/image/normalizeImage';
import {
  DISH_IMAGE_MIN_SOURCE,
  PRODUCT_IMAGE_SIZE,
} from '../src/domain/images/imageRules';

export const UNSPLASH_HOST = 'images.unsplash.com';

/**
 * Fetch at 1600px wide so the source clears DISH_IMAGE_MIN_SOURCE (800x600); a 800px-wide download would be
 * rejected as too small for any landscape photo that is not at least 3:4.
 */
export function unsplashDownloadUrl(photoId: string): string {
  return `https://${UNSPLASH_HOST}/photo-${photoId}?w=1600&auto=format&fit=crop`;
}

export interface UnsplashImageDeps {
  download: (url: string) => Promise<Buffer>;
  normalize: typeof normalizeImage;
  upload: (
    blobPath: string,
    bytes: Buffer,
    contentType: string,
  ) => Promise<void>;
  blobPath: (
    shopId: string,
    productId: string,
    imageId: string,
    ext: string,
  ) => string;
  blobUrl: (blobPath: string) => string;
}

/** Plain HTTPS GET with normal certificate validation; follows at most 3 redirects. */
export function httpsDownload(url: string, redirectsLeft = 3): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      const status = res.statusCode ?? 0;
      if (
        status >= 300 &&
        status < 400 &&
        res.headers.location &&
        redirectsLeft > 0
      ) {
        res.resume();
        return resolve(
          httpsDownload(
            new URL(res.headers.location, url).toString(),
            redirectsLeft - 1,
          ),
        );
      }
      if (status !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${status}`));
      }
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        if (body.length === 0) reject(new Error('empty body'));
        else resolve(body);
      });
      res.on('error', reject);
    });
    req.setTimeout(30000, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

export function defaultDeps(): UnsplashImageDeps {
  /* eslint-disable @typescript-eslint/no-var-requires */
  const storage = require('../src/infrastructure/storage/blobStorageHelpers');
  /* eslint-enable @typescript-eslint/no-var-requires */
  return {
    download: httpsDownload,
    normalize: normalizeImage,
    upload: storage.uploadBlob,
    blobPath: storage.generateBlobPath,
    blobUrl: storage.generateBlobUrl,
  };
}

/** photoId -> normalised JPEG, so a photo used by several dishes is downloaded and normalised once per run. */
export type UnsplashBytesCache = Map<string, Promise<Buffer>>;

export interface StoreUnsplashImageArgs {
  photoId: string;
  /** Dish name, used only in error messages. */
  label: string;
  shopId: string;
  productId: string;
  imageId: string;
}

/**
 * Returns the blob URL of the stored image. Throws (naming the dish and photo id) if the download fails or the
 * bytes are not a usable image; never returns an unsplash URL.
 */
export async function storeUnsplashImage(
  args: StoreUnsplashImageArgs,
  deps: UnsplashImageDeps = defaultDeps(),
  cache: UnsplashBytesCache = new Map(),
): Promise<string> {
  const { photoId, label, shopId, productId, imageId } = args;
  const fail = (why: string) =>
    new Error(`Unsplash photo ${photoId} for "${label}": ${why}`);

  let pending = cache.get(photoId);
  if (!pending) {
    pending = (async () => {
      let raw: Buffer;
      try {
        raw = await deps.download(unsplashDownloadUrl(photoId));
      } catch (e) {
        throw fail(`download failed (${(e as Error).message})`);
      }
      const out = await deps.normalize(
        raw,
        PRODUCT_IMAGE_SIZE,
        DISH_IMAGE_MIN_SOURCE,
        'jpg',
      );
      if (out.status !== 'ok') throw fail(`image rejected (${out.status})`);
      return out.bytes;
    })();
    cache.set(photoId, pending);
  }
  const bytes = await pending;

  const blobPath = deps.blobPath(shopId, productId, imageId, '.jpg');
  await deps.upload(blobPath, bytes, 'image/jpeg');
  return deps.blobUrl(blobPath);
}
