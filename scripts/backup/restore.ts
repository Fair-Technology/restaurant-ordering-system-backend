// Restore an archive into a SCRATCH Cosmos target (local emulator or a *-restore-test account) and count it.
//   RESTORE_COSMOS_ENDPOINT, RESTORE_COSMOS_KEY, RESTORE_COSMOS_DATABASE_ID   (names only)
//   npx ts-node --transpile-only scripts/backup/restore.ts <archiveDir>
// Deliberately uses RESTORE_* names, never COSMOS_DB_*, so a shell configured for the app cannot be a target.
import { CosmosClient } from '@azure/cosmos';
import { restoreArchive } from './archiveLib';

async function main() {
  const dir = process.argv[2];
  const endpoint = process.env.RESTORE_COSMOS_ENDPOINT;
  const key = process.env.RESTORE_COSMOS_KEY;
  const databaseId = process.env.RESTORE_COSMOS_DATABASE_ID;
  if (!dir || !endpoint || !key || !databaseId) {
    throw new Error('usage: restore.ts <archiveDir>; needs RESTORE_COSMOS_ENDPOINT, _KEY, _DATABASE_ID');
  }
  const results = await restoreArchive(new CosmosClient({ endpoint, key }), endpoint, databaseId, dir);
  let ok = true;
  for (const r of results) {
    const good = r.restored === r.expected && r.countInTarget === r.expected;
    ok = ok && good;
    console.log(`${r.container}: expected ${r.expected}, restored ${r.restored}, counted in target ${r.countInTarget} ${good ? 'OK' : 'MISMATCH'}`);
  }
  if (!ok) process.exit(2);
}
main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
