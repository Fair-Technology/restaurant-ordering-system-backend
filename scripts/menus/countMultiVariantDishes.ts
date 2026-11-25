// Read-only audit (t_15317299): a dish may now have at most one variant group (size), but dishes saved earlier can carry
// 2+. Counts, across every shop, the live dishes whose effective variant-group count is >= 2, i.e. inline variantGroups
// plus distinct optionGroupRefs pointing at a live library group of kind 'variant'. Never writes.
//   npx ts-node --transpile-only scripts/menus/countMultiVariantDishes.ts

import * as fs from 'fs';
import * as path from 'path';

const settingsPath = path.join(__dirname, '..', '..', 'local.settings.json');
if (fs.existsSync(settingsPath)) {
  const raw = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  for (const [k, v] of Object.entries(raw.Values ?? {})) if (process.env[k] === undefined) process.env[k] = v as string;
}

/* eslint-disable @typescript-eslint/no-var-requires */
const { findAllShops } = require('../../src/infrastructure/cosmos/shop/CosmosShopRepository');
const { findProductsByShopId } = require('../../src/infrastructure/cosmos/product/CosmosProductRepository');
const { findShopOptionGroupsByShopId } = require('../../src/infrastructure/cosmos/optionGroup/CosmosShopOptionGroupRepository');
/* eslint-enable @typescript-eslint/no-var-requires */

async function main(): Promise<void> {
  const host = new URL(process.env.COSMOS_DB_ENDPOINT ?? process.env.COSMOS_ENDPOINT ?? 'https://localhost').hostname;
  console.log(`Read-only report against ${host}\n`);

  const shops = await findAllShops();
  console.log(`${shops.length} shops scanned\n`);
  let dishTotal = 0;
  let shopTotal = 0;
  for (const shop of shops) {
    const [products, groups] = await Promise.all([findProductsByShopId(shop.id), findShopOptionGroupsByShopId(shop.id)]);
    const library = new Map<string, any>(groups.map((g: any) => [g.id, g]));
    const hits: { name: string; id: string; count: number }[] = [];
    for (const p of products) {
      if (p.isDeleted) continue;
      const refs = new Set<string>(p.optionGroupRefs ?? []);
      let count = p.variantGroups?.length ?? 0;
      for (const id of refs) {
        const g = library.get(id);
        if (g && !g.isDeleted && g.kind === 'variant') count++;
      }
      if (count >= 2) hits.push({ name: p.name, id: p.id, count });
    }
    if (hits.length === 0) continue;
    shopTotal++;
    dishTotal += hits.length;
    console.log(`Shop: ${shop.name} (${shop.id})`);
    for (const h of hits) console.log(`  ${h.name} (${h.id}): ${h.count} variant groups`);
    console.log('');
  }

  console.log(`${dishTotal} dishes across ${shopTotal} shops have 2+ variant groups`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
