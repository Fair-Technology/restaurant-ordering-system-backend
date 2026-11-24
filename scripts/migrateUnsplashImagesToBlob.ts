/**
 * One-off: move demo-shop dish photos that are hot-linked from images.unsplash.com
 * into our own `product-media` blob container (normalised like real uploads) and point the product documents at the blob URL.
 *
 * Dry-run by default; writes only with --apply. Idempotent: an image already on our storage is skipped.
 *
 *   npx ts-node --transpile-only scripts/migrateUnsplashImagesToBlob.ts --target=<cosmos host> [--apply]
 */
import * as fs from 'fs';
import * as path from 'path';
import type { Product } from '../src/domain/product/Product';
import { assertScriptTarget } from './deliveryTaxClassMigration';
import {
  defaultDeps,
  storeUnsplashImage,
  type UnsplashBytesCache,
} from './unsplashImage';

export const EXTERNAL_IMAGE_HOST = 'images.unsplash.com';

/**
 * Photo ids that Unsplash no longer serves (HTTP 404), mapped to the working photo `seed.ts` now uses. Dev data
 * seeded before the fix still references them; migrating those images would otherwise fail on the download.
 */
export const DEAD_PHOTO_REPLACEMENTS: Readonly<
  Record<string, { photoId: string; alt?: string }>
> = {
  '1617196034183-421b4040d609': { photoId: '1579871494447-9811cf80d66c' },
  '1585325701957-76ea5c8b36ab': { photoId: '1576107232684-1279f390859f' },
  '1551782618-c2d09b0e4c3f': {
    photoId: '1533089860892-a7c6f0a88666',
    alt: 'Sunny-side-up eggs with toast',
  },
  '1485808191679-5f86510bd3a7': { photoId: '1514432324607-a09d9b4aefdd' },
  '1631452180519-1b8dab981b82': { photoId: '1565557623262-b51c2513a641' },
};

export interface ExternalImage {
  productId: string;
  imageId: string;
  url: string;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Every image whose URL host is images.unsplash.com (case-insensitive); ours and other hosts are left alone. */
export function findExternalImages(
  products: readonly Product[],
): ExternalImage[] {
  const found: ExternalImage[] = [];
  for (const p of products) {
    for (const img of p.images ?? []) {
      if (hostOf(img.url) === EXTERNAL_IMAGE_HOST) {
        found.push({ productId: p.id, imageId: img.id, url: img.url });
      }
    }
  }
  return found;
}

/** `https://images.unsplash.com/photo-<id>?...` -> `<id>` (the whole path stem if it has no `photo-` prefix). */
export function photoIdOf(url: string): string {
  return new URL(url).pathname.replace(/^\/(photo-)?/, '');
}

async function main(): Promise<void> {
  // 1. Load env BEFORE any Cosmos / storage module is required (they read process.env at load time).
  const settingsPath = path.join(__dirname, '..', 'local.settings.json');
  if (fs.existsSync(settingsPath)) {
    const raw = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    Object.assign(process.env, raw.Values ?? {});
    console.log('✅ Loaded local.settings.json');
  } else {
    console.warn(
      '⚠️  local.settings.json not found — using defaults (Cosmos emulator)',
    );
  }

  const targetArg = process.argv
    .find((a) => a.startsWith('--target='))
    ?.slice('--target='.length);
  const apply = process.argv.includes('--apply');
  const host = assertScriptTarget(process.env.COSMOS_DB_ENDPOINT, targetArg);
  console.log(
    `Target database: ${host} — ${apply ? 'APPLY' : 'dry-run (pass --apply to write)'}`,
  );

  /* eslint-disable @typescript-eslint/no-var-requires */
  const {
    productContainer,
  } = require('../src/infrastructure/cosmos/cosmosClient');
  const deps = defaultDeps();
  const cache: UnsplashBytesCache = new Map();

  const { resources } = await productContainer.items
    .query({ query: 'SELECT * FROM c WHERE ARRAY_LENGTH(c.images) > 0' })
    .fetchAll();
  const products = resources as Product[];

  let withExternal = 0;
  let migrated = 0;
  let failures = 0;

  for (const product of products) {
    const external = findExternalImages([product]);
    if (external.length === 0) continue;
    withExternal++;

    const newUrls = new Map<string, string>();
    for (const ext of external) {
      try {
        // Dry-run still builds the would-be URL; only --apply downloads and uploads.
        const newUrl: string = apply
          ? await storeUnsplashImage(
              {
                photoId: (
                  DEAD_PHOTO_REPLACEMENTS[photoIdOf(ext.url)] ?? {
                    photoId: photoIdOf(ext.url),
                  }
                ).photoId,
                label: product.name,
                shopId: product.shopId,
                productId: product.id,
                imageId: ext.imageId,
              },
              deps,
              cache,
            )
          : deps.blobUrl(
              deps.blobPath(product.shopId, product.id, ext.imageId, '.jpg'),
            );
        newUrls.set(ext.imageId, newUrl);
        console.log(`${product.name} ${ext.url} -> ${newUrl}`);
      } catch (e) {
        failures++;
        console.error(
          `FAILED ${product.name} ${ext.url}: ${(e as Error).message}`,
        );
      }
    }

    if (newUrls.size === 0) continue;
    if (apply) {
      const updated: Product = {
        ...product,
        images: product.images!.map((img) => {
          if (!newUrls.has(img.id)) return img;
          const alt = DEAD_PHOTO_REPLACEMENTS[photoIdOf(img.url)]?.alt;
          return { ...img, url: newUrls.get(img.id)!, ...(alt ? { alt } : {}) };
        }),
      };
      try {
        // The products container is partitioned by /shopId (infra/main.bicep), not /id.
        await productContainer
          .item(product.id, product.shopId)
          .replace(updated);
        migrated += newUrls.size;
      } catch (e) {
        failures += newUrls.size;
        console.error(
          `FAILED to save product ${product.name} (${product.id}): ${(e as Error).message}`,
        );
      }
    } else {
      migrated += newUrls.size;
    }
  }

  console.log('');
  console.log(`Products scanned (with images): ${products.length}`);
  console.log(`Products with external images:  ${withExternal}`);
  console.log(
    `Images ${apply ? 'migrated' : 'that would be migrated'}: ${migrated}`,
  );
  console.log(`Failures: ${failures}`);
  if (failures > 0) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
