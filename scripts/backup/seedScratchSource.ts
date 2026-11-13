// Drill helper: fills a SCRATCH source database on the local emulator with synthetic orders and invoices,
// so export -> restore can be practised without touching dev or prod. Refuses any non-local endpoint.
import { CosmosClient } from '@azure/cosmos';
import { ARCHIVED_CONTAINERS, assertRestoreTargetIsScratch } from './archiveLib';

async function main() {
  const endpoint = process.env.SCRATCH_COSMOS_ENDPOINT;
  const key = process.env.SCRATCH_COSMOS_KEY;
  const databaseId = process.env.SCRATCH_COSMOS_DATABASE_ID;
  const n = Number(process.argv[2] ?? 50);
  if (!endpoint || !key || !databaseId) throw new Error('needs SCRATCH_COSMOS_ENDPOINT, _KEY, _DATABASE_ID');
  if (!['localhost', '127.0.0.1'].includes(new URL(endpoint).hostname)) throw new Error('local emulator only');
  assertRestoreTargetIsScratch(endpoint, databaseId);
  const { database } = await new CosmosClient({ endpoint, key }).databases.createIfNotExists({ id: databaseId });
  for (const c of ARCHIVED_CONTAINERS) {
    const { container } = await database.containers.createIfNotExists({
      id: c.name,
      partitionKey: { paths: [c.partitionKey] },
      uniqueKeyPolicy: c.uniqueKeys.length ? { uniqueKeys: [{ paths: [...c.uniqueKeys] }] } : undefined,
    });
    for (let i = 1; i <= n; i++) {
      const shopId = `shop-${i % 3}`;
      const id = `${c.name}-${i}`;
      await container.items.upsert(
        c.name === 'orders'
          ? { id, shopId, totalCents: 1000 + i, status: 'completed', synthetic: true }
          : { id, shopId, number: `SYN-${i}`, totalCents: 1000 + i, synthetic: true },
      );
    }
  }
  console.log(`seeded ${n} synthetic documents into each of orders, invoices`);
}
main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
