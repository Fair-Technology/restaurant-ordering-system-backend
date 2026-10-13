import * as fs from 'fs';
import * as path from 'path';

// One-off (2026-10-13): adds the "Delivery" tax class (19 %) to Germany's stored tax lists, and tidies every German
// shop's stored delivery-fee class back to null (the fee now always uses the Delivery class; owners cannot pick).
// Dry run by default; pass --apply to write. Refuses unless --target matches the configured database host.
// Safe to run twice: nothing is changed once the class is there and no shop carries a stored fee class.
//   npx ts-node --transpile-only scripts/add-delivery-tax-class.ts --target=<host> [--apply]

const settingsPath = path.join(__dirname, '..', 'local.settings.json');
if (fs.existsSync(settingsPath)) {
  const raw = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  for (const [k, v] of Object.entries(raw.Values ?? {})) if (process.env[k] === undefined) process.env[k] = v as string;
}

const ACTOR = 'script:add-delivery-tax-class';
const targetArg = process.argv.find((a) => a.startsWith('--target='))?.slice('--target='.length);

/* eslint-disable @typescript-eslint/no-var-requires */
const { assertScriptTarget, withDeliveryTaxClass, withDeliveryFeeClassReset } = require('./deliveryTaxClassMigration');
const host = assertScriptTarget(process.env.COSMOS_DB_ENDPOINT ?? process.env.COSMOS_ENDPOINT, targetArg);
const { findStoredReferenceLists, saveReferenceLists } = require('../src/infrastructure/cosmos/reference/CosmosReferenceListsRepository');
const { validateReferenceListsUpdate } = require('../src/application/reference/updateReferenceLists/validateReferenceListsUpdate');
const { shopContainer } = require('../src/infrastructure/cosmos/cosmosClient');
const { updateShop } = require('../src/infrastructure/cosmos/shop/CosmosShopRepository');
const { logAudit } = require('../src/application/_shared/auditHelpers');
/* eslint-enable @typescript-eslint/no-var-requires */

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  console.log(`${apply ? 'APPLYING to' : 'Dry run against'} ${host}\n`);
  const now = new Date();

  const stored = await findStoredReferenceLists('DE');
  if (!stored) {
    console.log('DE lists not stored; the code default already has Delivery.');
  } else {
    const next = withDeliveryTaxClass(stored);
    if (!next) {
      console.log('Delivery class already present.');
    } else {
      const valid = validateReferenceListsUpdate(
        stored,
        { allergens: next.allergens, additives: next.additives, taxClasses: next.taxClasses, defaultTaxClassId: next.defaultTaxClassId, taxRates: next.taxRates },
        now,
      );
      if (typeof valid === 'string') throw new Error(`Validation refused the new lists: ${valid}`);
      console.log('Adding tax class "delivery" (Lieferung / Delivery) and 3 rows: collection, delivery, dine_in at 19 % from 2026-01-01.');
      if (apply) {
        await saveReferenceLists({ ...stored, ...valid, updatedAt: now.toISOString(), updatedBy: ACTOR });
        await logAudit({
          shopId: 'platform',
          actorType: 'system',
          actorId: ACTOR,
          action: 'reference_lists.update',
          entityType: 'reference_lists',
          entityId: stored.id,
          entityName: 'Reference lists DE',
          changes: [
            { field: 'taxClasses', from: '[updated]', to: '[updated]' },
            { field: 'taxRates', from: '[updated]', to: '[updated]' },
          ],
        });
      }
    }
  }

  // All shops, deleted ones included (findAllShops is TOP 20 and would miss some).
  const { resources } = await shopContainer.items.query({ query: 'SELECT * FROM c', parameters: [] }).fetchAll();
  let shops = 0;
  for (const shop of resources.filter((s: any) => s.countryCode === 'DE')) {
    const next = withDeliveryFeeClassReset(shop);
    if (!next) continue;
    const from = shop.orderSettings?.deliveryFeeTaxClassId;
    shops++;
    console.log(`${shop.name}: ${from} → default (Lieferung 19 %)`);
    if (apply) {
      await updateShop({ ...next, updatedAt: now.toISOString() });
      await logAudit({
        shopId: shop.id,
        actorType: 'system',
        actorId: ACTOR,
        action: 'shop.order_settings_update',
        entityType: 'shop',
        entityId: shop.id,
        entityName: shop.name,
        changes: [{ field: 'deliveryFeeTaxClassId', from, to: null }],
      });
    }
  }
  console.log(`\n${shops} shop(s) ${apply ? 'reset' : 'would change'}.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
