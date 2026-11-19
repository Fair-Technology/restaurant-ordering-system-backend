import * as fs from 'fs';
import * as path from 'path';

// READ-ONLY investigation (2026-11-20): lists a shop's orders accepted on one local day with their stored
// taxBreakdown against totalCents. Never writes.
//   npx ts-node --transpile-only scripts/inspectOrderTaxBreakdown.ts --target=<host> --shop=<id> --day=YYYY-MM-DD

const settingsPath = path.join(__dirname, '..', 'local.settings.json');
if (fs.existsSync(settingsPath)) {
  const raw = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  for (const [k, v] of Object.entries(raw.Values ?? {})) if (process.env[k] === undefined) process.env[k] = v as string;
}
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);

/* eslint-disable @typescript-eslint/no-var-requires */
const { assertScriptTarget } = require('./deliveryTaxClassMigration');
const host = assertScriptTarget(process.env.COSMOS_DB_ENDPOINT ?? process.env.COSMOS_ENDPOINT, arg('target'));
const { orderContainer, shopContainer } = require('../src/infrastructure/cosmos/cosmosClient');
const { localDate } = require('../src/domain/order/orderTimers');
/* eslint-enable @typescript-eslint/no-var-requires */

async function main(): Promise<void> {
  const shopId = arg('shop');
  const day = arg('day');
  if (!shopId || !day) throw new Error('pass --shop=<id> --day=YYYY-MM-DD');
  console.log(`Read-only against ${host}`);
  const { resource: shop } = await shopContainer.item(shopId, shopId).read();
  if (!shop) throw new Error('shop not found');
  console.log(`shop ${shop.name} tz=${shop.timezone}`);
  const { resources } = await orderContainer.items
    .query({ query: 'SELECT * FROM c WHERE c.shopId = @s AND IS_DEFINED(c.acceptedAt)', parameters: [{ name: '@s', value: shopId }] })
    .fetchAll();
  const rows = resources.filter((o: any) => localDate(o.acceptedAt, shop.timezone) === day);
  console.log(`${rows.length} order(s) accepted on ${day}\n`);
  const only = arg('full');
  for (const o of rows) {
    if (only) {
      if (o.id !== only) continue;
      // Full document minus the diner's personal details.
      const { customerName, customerEmail, customerPhone, customerAddress, deliveryAddress, customerAccessToken, ...rest } = o;
      console.log(JSON.stringify(rest, null, 2));
      continue;
    }
    const total = o.totalCents ?? o.subtotalCents;
    const sum = o.taxBreakdown ? o.taxBreakdown.reduce((s: number, e: any) => s + e.grossCents, 0) : null;
    console.log(JSON.stringify({
      id: o.id, orderRef: o.orderRef, state: o.state, fulfilmentMode: o.fulfilmentMode, acceptedAt: o.acceptedAt,
      subtotalCents: o.subtotalCents, totalCents: o.totalCents, charges: o.charges, discount: o.discount,
      taxBreakdown: o.taxBreakdown, sumBreakdownGross: sum, diff: sum === null ? 'NO taxBreakdown' : sum - total,
    }, null, 2));
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
