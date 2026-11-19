import * as fs from 'fs';
import * as path from 'path';

// One-off (2026-11-20): an order whose stored taxBreakdown does not add up to what was charged (found: a delivery
// order of 2026-10-08, the day delivery fees shipped, whose breakdown carried the fee but whose total/charges did not)
// gets its taxBreakdown recomputed from its own items, charges and discount — the same function checkout uses.
// Only `taxBreakdown` is written. Orders whose recomputed breakdown still disagrees are reported, never written.
// Dry run by default; pass --apply to write. Refuses unless --target matches the configured database host.
// Idempotent: once fixed, an order no longer qualifies.
//   npx ts-node --transpile-only scripts/fixOrderTaxBreakdown.ts --target=<host> --shop=<shopId> [--apply]

const settingsPath = path.join(__dirname, '..', 'local.settings.json');
if (fs.existsSync(settingsPath)) {
  const raw = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  for (const [k, v] of Object.entries(raw.Values ?? {})) if (process.env[k] === undefined) process.env[k] = v as string;
}

const ACTOR = 'script:fix-order-tax-breakdown';
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);

/* eslint-disable @typescript-eslint/no-var-requires */
const { assertScriptTarget } = require('./deliveryTaxClassMigration');
const { planTaxBreakdownFix } = require('./orderTaxBreakdownFix');
const host = assertScriptTarget(process.env.COSMOS_DB_ENDPOINT ?? process.env.COSMOS_ENDPOINT, arg('target'));
const { orderContainer } = require('../src/infrastructure/cosmos/cosmosClient');
const { logAudit } = require('../src/application/_shared/auditHelpers');
/* eslint-enable @typescript-eslint/no-var-requires */

async function main(): Promise<void> {
  const shopId = arg('shop');
  if (!shopId) throw new Error('Refusing to run: pass --shop=<shopId>');
  const apply = process.argv.includes('--apply');
  console.log(`${apply ? 'APPLYING to' : 'Dry run against'} ${host}, shop ${shopId}\n`);

  const { resources } = await orderContainer.items
    .query({ query: 'SELECT * FROM c WHERE c.shopId = @s AND IS_DEFINED(c.taxBreakdown)', parameters: [{ name: '@s', value: shopId }] })
    .fetchAll();
  let fixed = 0;
  let unfixable = 0;
  for (const order of resources) {
    const plan = planTaxBreakdownFix(order);
    if (!plan) continue;
    const label = `${order.id} (${order.orderRef}, ${order.fulfilmentMode}, accepted ${order.acceptedAt ?? '-'})`;
    if (plan.kind === 'unfixable') {
      unfixable++;
      console.log(`SKIP ${label}: ${plan.reason}`);
      continue;
    }
    fixed++;
    console.log(`${apply ? 'FIX' : 'WOULD FIX'} ${label}`);
    console.log(`  charged ${plan.totalCents}; stored breakdown gross ${plan.beforeGrossCents}`);
    console.log(`  before: ${JSON.stringify(plan.before)}`);
    console.log(`  after:  ${JSON.stringify(plan.after)}`);
    if (apply) {
      // etag guard: if the order changed since the read, the write is refused instead of clobbering it.
      await orderContainer.item(order.id, order.id).replace(
        { ...order, taxBreakdown: plan.after },
        { accessCondition: { type: 'IfMatch', condition: order._etag } },
      );
      await logAudit({
        shopId,
        actorType: 'system',
        actorId: ACTOR,
        action: 'order.tax_breakdown_corrected',
        entityType: 'order',
        entityId: order.id,
        entityName: order.orderRef,
        changes: [{ field: 'taxBreakdown', from: JSON.stringify(plan.before), to: JSON.stringify(plan.after) }],
      });
    }
  }
  console.log(`\n${fixed} order(s) ${apply ? 'fixed' : 'would change'}, ${unfixable} skipped as unfixable.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
