// Manual run / drill of the daily archiveTimer: export orders + invoices, upload to the archive blob
// container under a new per-run prefix, then download and verify against the manifest.
//   Cosmos: COSMOS_DB_ENDPOINT, COSMOS_DB_DATABASE_ID, optional COSMOS_DB_KEY (else Azure identity)
//   Blob:   AZURE_STORAGE_CONNECTION_STRING, or STORAGE_ACCOUNT_NAME [+ STORAGE_ACCOUNT_KEY] (else Azure identity)
//   (names only; values from the environment — see src/infrastructure/archive/archiveClients.ts)
//   npx ts-node --transpile-only scripts/backup/exportToArchive.ts [outDir]   (default: os.tmpdir())
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { exportArchive } from '../../src/infrastructure/archive/archiveLib';
import { blobPrefixFor, uploadArchive, verifyUploadedArchive } from '../../src/infrastructure/archive/archiveBlob';
import { createArchiveCosmosClient, resolveArchiveBlobContainer } from '../../src/infrastructure/archive/archiveClients';

async function main() {
  const base = process.argv[2] ?? os.tmpdir();
  fs.mkdirSync(base, { recursive: true });
  const dir = fs.mkdtempSync(path.join(base, 'records-archive-'));
  const { client, endpoint, databaseId } = createArchiveCosmosClient();
  const { container, account, containerName } = resolveArchiveBlobContainer();
  const manifest = await exportArchive(client, endpoint, databaseId, dir);
  const uploaded = await uploadArchive(container, dir, manifest);
  await verifyUploadedArchive(container, manifest);
  for (const e of manifest.containers) console.log(`[archive] ${e.container}: ${e.count} documents, sha256 ${e.sha256}`);
  const bytes = uploaded.reduce((n, u) => n + u.bytes, 0);
  console.log(`[archive] verified ${uploaded.length} blobs (${bytes} bytes) in ${account}/${containerName}/${blobPrefixFor(manifest)}/`);
  console.log(`[archive] local copy: ${dir}`);
}
main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
