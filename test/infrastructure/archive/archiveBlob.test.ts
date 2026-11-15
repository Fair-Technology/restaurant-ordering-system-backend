import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { CosmosClient } from '@azure/cosmos';
import { exportArchive, type Manifest } from '../../../src/infrastructure/archive/archiveLib';
import {
  type BlobContainer,
  archiveBlobSpecs,
  blobPrefixFor,
  uploadArchive,
  verifyUploadedArchive,
} from '../../../src/infrastructure/archive/archiveBlob';

/** In-memory blob container that, like `records-archive` under its immutability policy, refuses overwrites. */
class FakeBlobContainer implements BlobContainer {
  readonly blobs = new Map<string, { body: Buffer; contentType: string }>();
  async uploadBlob(name: string, body: Buffer, contentType: string): Promise<void> {
    if (this.blobs.has(name)) throw new Error(`BlobAlreadyExists: ${name}`);
    this.blobs.set(name, { body: Buffer.from(body), contentType });
  }
  async downloadBlob(name: string): Promise<Buffer> {
    const b = this.blobs.get(name);
    if (!b) throw new Error(`BlobNotFound: ${name}`);
    return Buffer.from(b.body);
  }
}

/** Just enough of CosmosClient for exportArchive: one page of documents per container. */
function fakeCosmos(docs: Record<string, object[]>): CosmosClient {
  return {
    database: () => ({
      container: (name: string) => ({
        items: {
          query: () => {
            let done = false;
            return {
              hasMoreResults: () => !done,
              fetchNext: async () => {
                done = true;
                return { resources: docs[name] ?? [] };
              },
            };
          },
        },
      }),
    }),
  } as unknown as CosmosClient;
}

const DOCS = {
  orders: [
    { id: 'o1', shopId: 's1', totalCents: 1200, note: 'Grüße — €' },
    { id: 'o2', shopId: 's1', totalCents: 800 },
  ],
  invoices: [{ id: 'i1', shopId: 's1', number: 'INV-1' }],
};

async function exportTo(now: Date): Promise<{ dir: string; manifest: Manifest }> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-blob-'));
  const manifest = await exportArchive(
    fakeCosmos(DOCS),
    'https://localhost:8081',
    'db',
    dir,
    now,
  );
  return { dir, manifest };
}

describe('archive upload to blob storage', () => {
  it('derives a sortable, blob-safe prefix from createdAt', async () => {
    const { manifest } = await exportTo(new Date('2026-11-15T02:17:00.123Z'));
    expect(blobPrefixFor(manifest)).toBe('2026-11-15T02-17-00Z');
    expect(archiveBlobSpecs(manifest)).toEqual([
      { file: 'orders.jsonl', blob: '2026-11-15T02-17-00Z/orders.jsonl', contentType: 'application/x-ndjson' },
      { file: 'invoices.jsonl', blob: '2026-11-15T02-17-00Z/invoices.jsonl', contentType: 'application/x-ndjson' },
      { file: 'manifest.json', blob: '2026-11-15T02-17-00Z/manifest.json', contentType: 'application/json' },
    ]);
  });

  it('uploads one blob per manifest file under a single run prefix, bytes intact', async () => {
    const { dir, manifest } = await exportTo(new Date('2026-11-15T02:17:00Z'));
    const container = new FakeBlobContainer();
    const uploaded = await uploadArchive(container, dir, manifest);

    const prefix = blobPrefixFor(manifest);
    expect([...container.blobs.keys()].sort()).toEqual(
      [`${prefix}/invoices.jsonl`, `${prefix}/manifest.json`, `${prefix}/orders.jsonl`],
    );
    for (const u of uploaded) {
      const file = u.blob.slice(prefix.length + 1);
      const onDisk = fs.readFileSync(path.join(dir, file));
      expect(container.blobs.get(u.blob)!.body.equals(onDisk)).toBe(true);
      expect(u.bytes).toBe(onDisk.length);
    }
  });

  it('verifies a faithful upload', async () => {
    const { dir, manifest } = await exportTo(new Date('2026-11-15T02:17:00Z'));
    const container = new FakeBlobContainer();
    await uploadArchive(container, dir, manifest);
    const verified = await verifyUploadedArchive(container, manifest);
    expect(verified.containers.map((c) => [c.container, c.count])).toEqual([
      ['orders', 2],
      ['invoices', 1],
    ]);
  });

  it('throws, naming the blob, when a single byte of a downloaded blob is altered', async () => {
    const { dir, manifest } = await exportTo(new Date('2026-11-15T02:17:00Z'));
    const container = new FakeBlobContainer();
    await uploadArchive(container, dir, manifest);
    const name = `${blobPrefixFor(manifest)}/orders.jsonl`;
    const stored = container.blobs.get(name)!;
    const tampered = Buffer.from(stored.body);
    tampered[5] = tampered[5] ^ 0x01;
    container.blobs.set(name, { ...stored, body: tampered });

    await expect(verifyUploadedArchive(container, manifest)).rejects.toThrow(
      new RegExp(`${name}: checksum mismatch`),
    );
  });

  it('reports a missing blob by name', async () => {
    const { dir, manifest } = await exportTo(new Date('2026-11-15T02:17:00Z'));
    const container = new FakeBlobContainer();
    await uploadArchive(container, dir, manifest);
    const name = `${blobPrefixFor(manifest)}/invoices.jsonl`;
    container.blobs.delete(name);

    await expect(verifyUploadedArchive(container, manifest)).rejects.toThrow(new RegExp(`${name}: missing`));
  });

  it('gives a second run its own prefix, so it never overwrites the first (immutability-safe)', async () => {
    const container = new FakeBlobContainer();
    const first = await exportTo(new Date('2026-11-15T02:17:00Z'));
    const second = await exportTo(new Date('2026-11-16T02:17:00Z'));
    expect(blobPrefixFor(second.manifest)).not.toBe(blobPrefixFor(first.manifest));

    await uploadArchive(container, first.dir, first.manifest);
    const firstBlobs = new Map([...container.blobs].map(([k, v]) => [k, Buffer.from(v.body)]));
    await uploadArchive(container, second.dir, second.manifest); // the fake refuses any overwrite

    expect(container.blobs.size).toBe(6);
    for (const [k, body] of firstBlobs) expect(container.blobs.get(k)!.body.equals(body)).toBe(true);
    await expect(verifyUploadedArchive(container, first.manifest)).resolves.toBeTruthy();
    await expect(verifyUploadedArchive(container, second.manifest)).resolves.toBeTruthy();
  });
});
