// Ships an archive produced by exportArchive (archiveLib.ts) to the private `records-archive` blob
// container and checks the uploaded copy against the manifest (docs/specs.md §10, §20 "Backups").
//
// The container carries a time-based immutability policy, so a blob, once written, must never be
// written again: every run goes under its own prefix derived from the manifest's createdAt.
import * as fs from 'fs';
import * as path from 'path';
import type { ContainerClient } from '@azure/storage-blob';
import { type Manifest, verifyArchiveEntry } from './archiveLib';

/** The two blob operations the archive needs — small enough to fake in tests. */
export interface BlobContainer {
  uploadBlob(name: string, body: Buffer, contentType: string): Promise<void>;
  downloadBlob(name: string): Promise<Buffer>;
}

/** `2026-11-15T02:17:00.123Z` -> `2026-11-15T02-17-00Z`: unique per run, sorts by time, blob-name safe. */
export function blobPrefixFor(manifest: Manifest): string {
  const created = new Date(manifest.createdAt);
  if (Number.isNaN(created.getTime())) throw new Error(`Manifest createdAt is not a date: ${manifest.createdAt}`);
  return created
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replace(/[:.]/g, '-');
}

export function archiveBlobSpecs(manifest: Manifest): { file: string; blob: string; contentType: string }[] {
  const prefix = blobPrefixFor(manifest);
  return [
    ...manifest.containers.map((e) => ({ file: e.file, blob: `${prefix}/${e.file}`, contentType: 'application/x-ndjson' })),
    { file: 'manifest.json', blob: `${prefix}/manifest.json`, contentType: 'application/json' },
  ];
}

/** Uploads every archive file under this run's prefix. Returns blob name + byte length per file. */
export async function uploadArchive(
  container: BlobContainer,
  dir: string,
  manifest: Manifest,
): Promise<{ blob: string; bytes: number }[]> {
  const uploaded: { blob: string; bytes: number }[] = [];
  for (const spec of archiveBlobSpecs(manifest)) {
    const body = fs.readFileSync(path.join(dir, spec.file));
    await container.uploadBlob(spec.blob, body, spec.contentType);
    uploaded.push({ blob: spec.blob, bytes: body.length });
  }
  return uploaded;
}

/**
 * Downloads the uploaded copy and checks it: the stored manifest must match the one we wrote, and every
 * JSONL blob must match its SHA-256 and line count. Throws an Error naming the blob on any problem.
 */
export async function verifyUploadedArchive(container: BlobContainer, manifest: Manifest): Promise<Manifest> {
  const prefix = blobPrefixFor(manifest);
  const manifestBlob = `${prefix}/manifest.json`;
  const stored = JSON.parse((await download(container, manifestBlob)).toString('utf-8')) as Manifest;
  if (JSON.stringify(stored) !== JSON.stringify(manifest)) {
    throw new Error(`${manifestBlob}: uploaded manifest differs from the one exported`);
  }
  for (const e of manifest.containers) {
    const blob = `${prefix}/${e.file}`;
    verifyArchiveEntry(await download(container, blob), e, blob);
  }
  return stored;
}

async function download(container: BlobContainer, blob: string): Promise<Buffer> {
  try {
    return await container.downloadBlob(blob);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`${blob}: missing or unreadable in the archive container (${reason})`);
  }
}

/** Adapter over @azure/storage-blob. Bytes go up and come back unchanged. */
export function containerClientToBlobContainer(client: ContainerClient): BlobContainer {
  return {
    async uploadBlob(name, body, contentType) {
      await client.getBlockBlobClient(name).uploadData(body, { blobHTTPHeaders: { blobContentType: contentType } });
    },
    async downloadBlob(name) {
      return client.getBlockBlobClient(name).downloadToBuffer();
    },
  };
}
