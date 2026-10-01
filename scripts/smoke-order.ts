import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { assertSeedTargetIsDev } from './seedGuard';

// ── 1. Load env vars BEFORE Cosmos modules initialize ────────────────────────
// Same order as seed.ts: Cosmos client reads process.env at module load time,
// so env vars must be populated before the first require() of any cosmos module.
const settingsPath = path.join(__dirname, '..', 'local.settings.json');
if (fs.existsSync(settingsPath)) {
  const raw = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  Object.assign(process.env, raw.Values ?? {});
  console.log('✅ Loaded local.settings.json');
} else {
  console.warn('⚠️  local.settings.json not found — using defaults (Cosmos emulator)');
}

// Refuse to run against anything but the restaurant-ordering dev database —
// this exercises the real order/usage write path, so the wrong endpoint must
// fail loudly before anything is written.
assertSeedTargetIsDev(process.env.COSMOS_DB_ENDPOINT ?? process.env.COSMOS_ENDPOINT);

// ── 2. Require Cosmos/application modules AFTER env vars are populated ───────
/* eslint-disable @typescript-eslint/no-var-requires */
const { findShopBySlug } = require('../src/infrastructure/cosmos/shop/CosmosShopRepository');
const {
  createCheckoutSession,
} = require('../src/infrastructure/cosmos/order/CosmosCheckoutSessionRepository');
const {
  findOrderById,
  findOrderByStripePaymentIntentId,
  countOrdersInUsagePeriod,
} = require('../src/infrastructure/cosmos/order/CosmosOrderRepository');
const { findUsageByShopId } = require('../src/infrastructure/cosmos/usage/CosmosUsageRepository');
const {
  executeHandlePaymentSucceeded,
} = require('../src/application/order/handlePaymentSucceeded/executeHandlePaymentSucceeded');
/* eslint-enable @typescript-eslint/no-var-requires */

// ── Helpers ───────────────────────────────────────────────────────────────────
let failures = 0;
function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`   ✓ ${message}`);
  } else {
    console.error(`   ✗ ${message}`);
    failures++;
  }
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('🔥 Restaurant Ordering System — Smoke Order');
  console.log('=========================================');

  const shop = await findShopBySlug('pizzeria-kreuzberg');
  if (!shop) {
    console.error('❌ Shop pizzeria-kreuzberg not found — run npm run seed first');
    process.exit(1);
  }

  const sessionId = randomUUID();
  const paymentIntentId = 'pi_smoke_' + Date.now();
  const sessionDoc = {
    id: sessionId,
    shopId: shop.id,
    stripePaymentIntentId: paymentIntentId,
    items: [
      {
        productId: 'smoke',
        productName: 'Smoke test',
        quantity: 1,
        unitPriceCents: 1000,
        lineTotalCents: 1000,
      },
    ],
    subtotalCents: 1000,
    currency: 'EUR',
    customerName: 'Smoke',
    customerEmail: 'smoke@example.invalid',
    customerPhone: '0',
    fulfilmentMode: 'collection',
    createdAt: new Date().toISOString(),
    ttl: 3600,
  };

  console.log(`\n🏪 Shop: ${shop.name} (${shop.id})`);

  await createCheckoutSession(sessionDoc);
  console.log('   ✓ checkout session created');

  const usageBefore = await findUsageByShopId(shop.id);

  console.log('\n💳 Delivering payment_intent.succeeded (first time)...');
  const outcome1 = await executeHandlePaymentSucceeded({ sessionId, paymentIntentId });
  assert(outcome1 === 'created', `first delivery outcome is 'created' (got '${outcome1}')`);

  const order = await findOrderById(sessionId);
  assert(!!order && order.state === 'ACCEPTED', `order state is 'ACCEPTED' (got '${order?.state}')`);
  assert(
    !!order && order.history?.length === 2,
    `order history has 2 entries (got ${order?.history?.length})`,
  );

  const orderByPi = await findOrderByStripePaymentIntentId(paymentIntentId);
  assert(
    !!orderByPi && orderByPi.id === sessionId,
    'findOrderByStripePaymentIntentId returns the same order',
  );

  const usageAfter = await findUsageByShopId(shop.id);
  const sameKey = usageBefore?.periodKey === order?.usagePeriodKey;
  const expectedCount = sameKey ? (usageBefore?.acceptedOrderCount ?? 0) + 1 : 1;
  assert(
    !!usageAfter && usageAfter.acceptedOrderCount === expectedCount,
    `usage acceptedOrderCount is ${expectedCount} (got ${usageAfter?.acceptedOrderCount})`,
  );

  console.log('\n💳 Redelivering the same webhook (duplicate)...');
  // The successful delivery above deleted the checkout session, so recreate
  // the same document (same id) before redelivering — this is what a
  // redelivered Stripe webhook actually looks like at this layer.
  await createCheckoutSession(sessionDoc);
  const outcome2 = await executeHandlePaymentSucceeded({ sessionId, paymentIntentId });
  assert(outcome2 === 'duplicate', `redelivery outcome is 'duplicate' (got '${outcome2}')`);

  const usageAfterDuplicate = await findUsageByShopId(shop.id);
  assert(
    usageAfterDuplicate?.acceptedOrderCount === usageAfter?.acceptedOrderCount,
    'usage unchanged after duplicate delivery',
  );

  const countInPeriod = await countOrdersInUsagePeriod(shop.id, order.usagePeriodKey);
  assert(
    countInPeriod === usageAfterDuplicate?.acceptedOrderCount,
    `countOrdersInUsagePeriod (${countInPeriod}) matches usage count (${usageAfterDuplicate?.acceptedOrderCount})`,
  );

  if (failures > 0) {
    console.error(`\n❌ Smoke order failed: ${failures} assertion(s) did not hold`);
    process.exit(1);
  }
  console.log('\n✅ Smoke order passed');
}

main().catch((err) => {
  console.error('\n❌ Smoke order crashed:', err);
  process.exit(1);
});
