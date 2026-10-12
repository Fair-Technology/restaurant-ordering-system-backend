import * as fs from 'fs';
import * as path from 'path';

// One-off (2026-10-12): every dish now owns its tax class. Gives each dish still without one the class it
// is taxed at today (its first category's, else the country default), so no price or receipt changes.
// Dry run by default; pass --apply to write. Safe to run twice: dishes with a class are skipped.
//   npx ts-node --transpile-only scripts/convert-dish-tax-classes.ts [--apply]

const settingsPath = path.join(__dirname, '..', 'local.settings.json');
if (fs.existsSync(settingsPath)) {
  const raw = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  for (const [k, v] of Object.entries(raw.Values ?? {})) if (process.env[k] === undefined) process.env[k] = v as string;
}

/* eslint-disable @typescript-eslint/no-var-requires */
const { findAllShops } = require('../src/infrastructure/cosmos/shop/CosmosShopRepository');
const { findCategoriesByShopId } = require('../src/infrastructure/cosmos/category/CosmosCategoryRepository');
const { findProductsByShopId, updateProduct } = require('../src/infrastructure/cosmos/product/CosmosProductRepository');
const { getReferenceLists } = require('../src/infrastructure/cosmos/reference/CosmosReferenceListsRepository');
const { suggestedTaxClassId } = require('../src/domain/order/tax');
/* eslint-enable @typescript-eslint/no-var-requires */

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const host = new URL(process.env.COSMOS_DB_ENDPOINT ?? process.env.COSMOS_ENDPOINT ?? 'https://localhost').hostname;
  console.log(`${apply ? 'APPLYING to' : 'Dry run against'} ${host}\n`);

  let total = 0;
  for (const shop of await findAllShops()) {
    const [categories, products, refs] = await Promise.all([
      findCategoriesByShopId(shop.id),
      findProductsByShopId(shop.id),
      getReferenceLists(shop.countryCode ?? ''),
    ]);
    const todo = products.filter((p: any) => !p.isDeleted && !p.combo && !p.taxClassId);
    const counts = new Map<string, number>();
    for (const p of todo) {
      const taxClassId = suggestedTaxClassId(p.categoryIds ?? [], categories, refs.defaultTaxClassId);
      if (!taxClassId) continue; // a country without tax classes: nothing to copy
      counts.set(taxClassId, (counts.get(taxClassId) ?? 0) + 1);
      total++;
      if (apply) await updateProduct({ ...p, taxClassId, updatedAt: new Date().toISOString() });
    }
    if (counts.size > 0) {
      console.log(`${shop.name}: ${[...counts].map(([c, n]) => `${n} → ${c}`).join(', ')}`);
    }
  }
  console.log(`\n${total} dish(es) ${apply ? 'converted' : 'would be converted'}.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
