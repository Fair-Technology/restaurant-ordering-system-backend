/**
 * One-off: move Ma Pasta's dish photos that are hot-linked from www.mapasta.de (expired TLS certificate)
 * into our own `product-media` blob container and point the product documents at the blob URL.
 *
 * Dry-run by default; writes only with --apply. Idempotent: an image already on our storage is skipped.
 *
 *   npx ts-node --transpile-only scripts/migrateMapastaImagesToBlob.ts --target=<cosmos host> [--apply]
 */
import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';
import type { Product } from '../src/domain/product/Product';
import { assertScriptTarget } from './deliveryTaxClassMigration';

export const EXTERNAL_IMAGE_HOST = 'www.mapasta.de';

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

/** Every image whose URL host is www.mapasta.de (case-insensitive); ours and other hosts are left alone. */
export function findExternalImages(products: readonly Product[]): ExternalImage[] {
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

/** GET over HTTPS; certificate verification is skipped for this one request only (the host's cert has expired). */
export function downloadInsecure(url: string, redirectsLeft = 3): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { rejectUnauthorized: false }, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location && redirectsLeft > 0) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        if (hostOf(next) !== EXTERNAL_IMAGE_HOST) return reject(new Error(`redirect to unexpected host ${next}`));
        return resolve(downloadInsecure(next, redirectsLeft - 1));
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

async function main(): Promise<void> {
  // 1. Load env BEFORE any Cosmos / storage module is required (they read process.env at load time).
  const settingsPath = path.join(__dirname, '..', 'local.settings.json');
  if (fs.existsSync(settingsPath)) {
    const raw = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    Object.assign(process.env, raw.Values ?? {});
    console.log('✅ Loaded local.settings.json');
  } else {
    console.warn('⚠️  local.settings.json not found — using defaults (Cosmos emulator)');
  }

  const targetArg = process.argv.find((a) => a.startsWith('--target='))?.slice('--target='.length);
  const apply = process.argv.includes('--apply');
  const host = assertScriptTarget(process.env.COSMOS_DB_ENDPOINT, targetArg);
  console.log(`Target database: ${host} — ${apply ? 'APPLY' : 'dry-run (pass --apply to write)'}`);

  /* eslint-disable @typescript-eslint/no-var-requires */
  const { productContainer } = require('../src/infrastructure/cosmos/cosmosClient');
  const { uploadBlob, generateBlobPath, generateBlobUrl } = require('../src/infrastructure/storage/blobStorageHelpers');

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
      const blobPath = generateBlobPath(product.shopId, product.id, ext.imageId, '.jpg');
      const newUrl: string = generateBlobUrl(blobPath);
      try {
        if (apply) {
          const bytes = await downloadInsecure(ext.url);
          await uploadBlob(blobPath, bytes, 'image/jpeg');
        }
        newUrls.set(ext.imageId, newUrl);
        console.log(`${product.name} ${ext.url} -> ${newUrl}`);
      } catch (e) {
        failures++;
        console.error(`FAILED ${product.name} ${ext.url}: ${(e as Error).message}`);
      }
    }

    if (newUrls.size === 0) continue;
    if (apply) {
      const updated: Product = {
        ...product,
        images: product.images!.map((img) => (newUrls.has(img.id) ? { ...img, url: newUrls.get(img.id)! } : img)),
      };
      try {
        // The products container is partitioned by /shopId (infra/main.bicep), not /id.
        await productContainer.item(product.id, product.shopId).replace(updated);
        migrated += newUrls.size;
      } catch (e) {
        failures += newUrls.size;
        console.error(`FAILED to save product ${product.name} (${product.id}): ${(e as Error).message}`);
      }
    } else {
      migrated += newUrls.size;
    }
  }

  console.log('');
  console.log(`Products scanned (with images): ${products.length}`);
  console.log(`Products with external images:  ${withExternal}`);
  console.log(`Images ${apply ? 'migrated' : 'that would be migrated'}: ${migrated}`);
  console.log(`Failures: ${failures}`);
  if (failures > 0) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
