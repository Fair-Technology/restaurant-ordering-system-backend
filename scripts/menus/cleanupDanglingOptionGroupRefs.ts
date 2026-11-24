// One-off (2026-11-25, t_da8eef9f): deleting an option group used to leave its id behind in products'
// `optionGroupRefs`, so the next save of such a product failed with "Unknown option group". The delete now cascades;
// (a ref is dangling when its group is soft-deleted or missing) this cleans up the refs that were already dangling in the Ma Pasta shop (e.g. Pomodoro -> "[explorer] Extras").
// Dry run by default; pass --apply to write. Idempotent: once a product has no refs to deleted groups it is skipped.
//   npx ts-node --transpile-only scripts/menus/cleanupDanglingOptionGroupRefs.ts [--apply]

import * as fs from 'fs';
import * as path from 'path';

const settingsPath = path.join(__dirname, '..', '..', 'local.settings.json');
if (fs.existsSync(settingsPath)) {
  const raw = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  for (const [k, v] of Object.entries(raw.Values ?? {})) if (process.env[k] === undefined) process.env[k] = v as string;
}

/* eslint-disable @typescript-eslint/no-var-requires */
const { findShopBySlug } = require('../../src/infrastructure/cosmos/shop/CosmosShopRepository');
const { findProductsByShopId, updateProduct } = require('../../src/infrastructure/cosmos/product/CosmosProductRepository');
const { findShopOptionGroupsByShopId } = require('../../src/infrastructure/cosmos/optionGroup/CosmosShopOptionGroupRepository');
/* eslint-enable @typescript-eslint/no-var-requires */

const SLUG = 'ma-pasta';

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const host = new URL(process.env.COSMOS_DB_ENDPOINT ?? process.env.COSMOS_ENDPOINT ?? 'https://localhost').hostname;
  console.log(`${apply ? 'APPLYING to' : 'Dry run against'} ${host}\n`);

  const shop = await findShopBySlug(SLUG);
  if (!shop) {
    console.error(`Shop with slug "${SLUG}" not found`);
    process.exit(1);
  }
  console.log(`Shop: ${shop.name} (${shop.id})`);

  const [groups, products] = await Promise.all([findShopOptionGroupsByShopId(shop.id), findProductsByShopId(shop.id)]);
  // findShopOptionGroupsByShopId only returns live (isDeleted = false) groups, so "deleted" is "not in this set" -
  // the same condition validateMenuFields rejects on (missing or soft-deleted).
  const liveIds = new Set<string>(groups.map((g: any) => g.id));
  console.log(`${groups.length} live option groups; ${products.length} products\n`);

  const now = new Date().toISOString();
  let changed = 0;
  let refsRemoved = 0;
  for (const p of products) {
    const refs: string[] = p.optionGroupRefs ?? [];
    const dangling = refs.filter((id) => !liveIds.has(id));
    if (dangling.length === 0) continue;
    console.log(`product   ${p.name} (${p.id}): ${apply ? 'REMOVE' : 'would remove'} ${dangling.join(', ')}`);
    if (apply) {
      await updateProduct({ ...p, optionGroupRefs: refs.filter((id) => liveIds.has(id)), updatedAt: now });
    }
    changed++;
    refsRemoved += dangling.length;
  }

  console.log(
    `\n${apply ? 'Applied' : 'Dry run'}: ${changed} products ${apply ? 'fixed' : 'need fixing'}, ${refsRemoved} dangling refs ${apply ? 'removed' : 'to remove'}, of ${products.length}.`,
  );
  if (!apply) console.log('Pass --apply to write.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
