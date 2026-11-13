// Read-only export of orders + invoices to a local archive directory.
//   COSMOS_DB_ENDPOINT, COSMOS_DB_KEY, COSMOS_DB_DATABASE_ID   (names only; values from the environment)
//   npx ts-node --transpile-only scripts/backup/export.ts <outDir>
import { CosmosClient } from '@azure/cosmos';
import { exportArchive } from './archiveLib';

async function main() {
  const outDir = process.argv[2];
  const endpoint = process.env.COSMOS_DB_ENDPOINT;
  const key = process.env.COSMOS_DB_KEY;
  const databaseId = process.env.COSMOS_DB_DATABASE_ID;
  if (!outDir || !endpoint || !key || !databaseId) {
    throw new Error('usage: export.ts <outDir>; needs COSMOS_DB_ENDPOINT, COSMOS_DB_KEY, COSMOS_DB_DATABASE_ID');
  }
  const manifest = await exportArchive(new CosmosClient({ endpoint, key }), endpoint, databaseId, outDir);
  for (const e of manifest.containers) console.log(`${e.container}: ${e.count} documents, sha256 ${e.sha256}`);
}
main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
