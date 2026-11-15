import { app, InvocationContext } from '@azure/functions';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { exportArchive } from '../../../infrastructure/archive/archiveLib';
import { blobPrefixFor, uploadArchive, verifyUploadedArchive } from '../../../infrastructure/archive/archiveBlob';
import { createArchiveCosmosClient, resolveArchiveBlobContainer } from '../../../infrastructure/archive/archiveClients';

// The eight-year copy of orders + invoices (SPECS §10, §20 "Backups"): export -> upload to the private
// `records-archive` container under a per-run prefix -> download and verify against the manifest.
// Errors are thrown, so a failed run shows up as a failed invocation, never as a silent success.
app.timer('archiveTimer', {
  schedule: '0 17 2 * * *', // daily at 02:17 UTC, after the order timer's local-midnight auto-complete
  handler: async (_timer: unknown, context: InvocationContext) => {
    const { client, endpoint, databaseId } = createArchiveCosmosClient();
    const { container, account, containerName } = resolveArchiveBlobContainer();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'records-archive-'));
    try {
      const manifest = await exportArchive(client, endpoint, databaseId, dir);
      const uploaded = await uploadArchive(container, dir, manifest);
      await verifyUploadedArchive(container, manifest);
      for (const e of manifest.containers) {
        context.log(`[archive] ${e.container}: ${e.count} documents, sha256 ${e.sha256}`);
      }
      const bytes = uploaded.reduce((n, u) => n + u.bytes, 0);
      context.log(
        `[archive] verified ${uploaded.length} blobs (${bytes} bytes) in ${account}/${containerName}/${blobPrefixFor(manifest)}/`,
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
});
