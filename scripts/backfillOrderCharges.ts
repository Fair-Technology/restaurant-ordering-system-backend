import * as fs from 'fs';
import * as path from 'path';

// One-off (2026-11-20): order 895-3W5 (2026-10-08, the day delivery fees shipped) was charged 1550 by Stripe
// (subtotal 1300 + 250 delivery fee) and its taxBreakdown says 1550, but the order stored no `charges` / `totalCents`.
// This writes back ONLY `charges` and `totalCents`, from the amount a human read off the Stripe PaymentIntent.
// Dry run by default; --apply writes. Refuses unless --target matches the configured database host, and unless the
// order's own subtotal, the fee and its taxBreakdown all agree with --charged-cents. etag-guarded; audit-logged.
//   npx ts-node --transpile-only scripts/backfillOrderCharges.ts --target=<host> --shop=<id> --order=<id> \
//     --charged-cents=1550 --fee-cents=250 --tax-class=food --rate-bp=700 [--apply]

const settingsPath = path.join(__dirname, '..', 'local.settings.json');
if (fs.existsSync(settingsPath)) {
  const raw = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  for (const [k, v] of Object.entries(raw.Values ?? {})) if (process.env[k] === undefined) process.env[k] = v as string;
}

const ACTOR = 'script:backfill-order-charges';
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);

/* eslint-disable @typescript-eslint/no-var-requires */
const { assertScriptTarget } = require('./deliveryTaxClassMigration');
const { planChargesBackfill } = require('./orderChargesBackfill');
const { extractVatCents } = require('../src/domain/order/tax');
const host = assertScriptTarget(process.env.COSMOS_DB_ENDPOINT ?? process.env.COSMOS_ENDPOINT, arg('target'));
const { orderContainer } = require('../src/infrastructure/cosmos/cosmosClient');
const { logAudit } = require('../src/application/_shared/auditHelpers');
/* eslint-enable @typescript-eslint/no-var-requires */

async function main(): Promise<void> {
  const shopId = arg('shop');
  const orderId = arg('order');
  const charged = Number(arg('charged-cents'));
  const feeCents = Number(arg('fee-cents'));
  const rate = Number(arg('rate-bp'));
  const taxClassId = arg('tax-class');
  if (!shopId || !orderId || !taxClassId || ![charged, feeCents, rate].every(Number.isInteger)) {
    throw new Error('Refusing to run: pass --shop --order --charged-cents --fee-cents --tax-class --rate-bp');
  }
  const apply = process.argv.includes('--apply');
  console.log(`${apply ? 'APPLYING to' : 'Dry run against'} ${host}, shop ${shopId}, order ${orderId}\n`);

  const { resource: order } = await orderContainer.item(orderId, orderId).read();
  if (!order || order.shopId !== shopId) throw new Error('order not found in that shop');
  const fee = { kind: 'delivery_fee', grossCents: feeCents, taxClassId, taxRateBasisPoints: rate, taxCents: extractVatCents(feeCents, rate) };
  const plan = planChargesBackfill(order, fee, charged);
  if (plan.kind !== 'backfill') {
    console.log(plan.kind === 'noop' ? 'Nothing to do (already backfilled).' : `REFUSED: ${plan.reason}`);
    process.exit(plan.kind === 'noop' ? 0 : 1);
  }
  console.log(`${order.orderRef}: before charges=${JSON.stringify(order.charges)} totalCents=${order.totalCents}`);
  console.log(`${order.orderRef}: after  charges=${JSON.stringify(plan.charges)} totalCents=${plan.totalCents}`);
  console.log(`taxBreakdown left as is: ${JSON.stringify(order.taxBreakdown)}`);
  if (!apply) return void console.log('\nDry run only; pass --apply to write.');
  await orderContainer.item(orderId, orderId).replace(
    { ...order, charges: plan.charges, totalCents: plan.totalCents },
    { accessCondition: { type: 'IfMatch', condition: order._etag } },
  );
  await logAudit({
    shopId,
    actorType: 'system',
    actorId: ACTOR,
    action: 'order.charges_backfilled',
    entityType: 'order',
    entityId: order.id,
    entityName: order.orderRef,
    changes: [
      { field: 'charges', from: 'undefined', to: JSON.stringify(plan.charges) },
      { field: 'totalCents', from: 'undefined', to: String(plan.totalCents) },
    ],
  });
  console.log('\nApplied.');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
