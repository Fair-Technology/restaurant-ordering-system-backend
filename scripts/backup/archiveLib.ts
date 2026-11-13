// Archive + restore for the records restaurants must keep for eight years: the `orders` and `invoices`
// containers (invoices are the immutable snapshots). Cosmos' own continuous backup only reaches back
// 30 days (see docs/prod-runbook.md §11), so these functions produce the long-lived copy:
// one JSONL file per container plus a manifest with counts and SHA-256 digests.
//
// Export only READS. Restore only WRITES, and only into a target that passes assertRestoreTargetIsScratch.
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { CosmosClient } from '@azure/cosmos';

export const ARCHIVED_CONTAINERS = [
  { name: 'orders', partitionKey: '/id', uniqueKeys: [] as string[] },
  { name: 'invoices', partitionKey: '/shopId', uniqueKeys: ['/number'] },
] as const;

export const RETENTION_YEARS = 8;

export interface ManifestEntry {
  container: string;
  file: string;
  count: number;
  sha256: string;
}
export interface Manifest {
  formatVersion: 1;
  createdAt: string;
  sourceEndpointHost: string;
  sourceDatabase: string;
  containers: ManifestEntry[];
}

/** Hosts a restore may write to: a local emulator, or a throw-away account named `*-restore-test` (the §11 drill). */
export function assertRestoreTargetIsScratch(endpoint: string, databaseId: string): void {
  const host = new URL(endpoint).hostname;
  const local = host === 'localhost' || host === '127.0.0.1';
  const drillAccount = /^[a-z0-9-]+-restore-test\.documents\.azure\.com$/.test(host);
  if (!local && !drillAccount) {
    throw new Error(`Refusing to restore: ${host} is not a scratch target (localhost or *-restore-test)`);
  }
  if (!databaseId) throw new Error('Refusing to restore: no target database id');
}

export async function exportArchive(
  client: CosmosClient,
  endpoint: string,
  databaseId: string,
  outDir: string,
  now: Date = new Date(),
): Promise<Manifest> {
  fs.mkdirSync(outDir, { recursive: true });
  const entries: ManifestEntry[] = [];
  for (const c of ARCHIVED_CONTAINERS) {
    const file = `${c.name}.jsonl`;
    const hash = createHash('sha256');
    const fd = fs.openSync(path.join(outDir, file), 'w');
    let count = 0;
    try {
      const iterator = client
        .database(databaseId)
        .container(c.name)
        .items.query('SELECT * FROM c');
      while (iterator.hasMoreResults()) {
        const { resources } = await iterator.fetchNext();
        for (const doc of resources ?? []) {
          const line = JSON.stringify(doc) + '\n';
          hash.update(line);
          fs.writeSync(fd, line);
          count += 1;
        }
      }
    } finally {
      fs.closeSync(fd);
    }
    entries.push({ container: c.name, file, count, sha256: hash.digest('hex') });
  }
  const manifest: Manifest = {
    formatVersion: 1,
    createdAt: now.toISOString(),
    sourceEndpointHost: new URL(endpoint).hostname,
    sourceDatabase: databaseId,
    containers: entries,
  };
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

/** Re-reads an archive and checks every file against the manifest. Throws on any mismatch. */
export function verifyArchive(dir: string): Manifest {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf-8')) as Manifest;
  for (const e of manifest.containers) {
    const text = fs.readFileSync(path.join(dir, e.file), 'utf-8');
    const digest = createHash('sha256').update(text).digest('hex');
    const lines = text === '' ? 0 : text.trimEnd().split('\n').length;
    if (digest !== e.sha256) throw new Error(`${e.file}: checksum mismatch`);
    if (lines !== e.count) throw new Error(`${e.file}: ${lines} lines, manifest says ${e.count}`);
  }
  return manifest;
}

export interface RestoreResult {
  container: string;
  expected: number;
  restored: number;
  countInTarget: number;
}

/** Upserts the archive into the target (creating the scratch database/containers) and counts what is there. */
export async function restoreArchive(
  client: CosmosClient,
  endpoint: string,
  databaseId: string,
  dir: string,
): Promise<RestoreResult[]> {
  assertRestoreTargetIsScratch(endpoint, databaseId);
  const manifest = verifyArchive(dir);
  const { database } = await client.databases.createIfNotExists({ id: databaseId });
  const results: RestoreResult[] = [];
  for (const e of manifest.containers) {
    const spec = ARCHIVED_CONTAINERS.find((c) => c.name === e.container);
    if (!spec) throw new Error(`Unknown container in manifest: ${e.container}`);
    const { container } = await database.containers.createIfNotExists({
      id: spec.name,
      partitionKey: { paths: [spec.partitionKey] },
      uniqueKeyPolicy: spec.uniqueKeys.length ? { uniqueKeys: [{ paths: [...spec.uniqueKeys] }] } : undefined,
    });
    let restored = 0;
    const lines = fs.readFileSync(path.join(dir, e.file), 'utf-8').split('\n').filter(Boolean);
    for (const line of lines) {
      await container.items.upsert(JSON.parse(line));
      restored += 1;
    }
    const { resources } = await container.items.query('SELECT VALUE COUNT(1) FROM c').fetchAll();
    results.push({ container: e.container, expected: e.count, restored, countInTarget: resources[0] as number });
  }
  return results;
}
