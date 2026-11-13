import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { assertRestoreTargetIsScratch, verifyArchive } from '../../scripts/backup/archiveLib';

describe('assertRestoreTargetIsScratch', () => {
  it('accepts a local emulator and a *-restore-test account', () => {
    expect(() => assertRestoreTargetIsScratch('https://localhost:18081', 'x')).not.toThrow();
    expect(() =>
      assertRestoreTargetIsScratch('https://restaurant-ordering-system-db-prod-restore-test.documents.azure.com', 'x'),
    ).not.toThrow();
  });
  it('refuses the live dev and prod accounts', () => {
    for (const h of ['restaurant-ordering-system-db-dev', 'restaurant-ordering-system-db-prod']) {
      expect(() => assertRestoreTargetIsScratch(`https://${h}.documents.azure.com`, 'x')).toThrow(/scratch/);
    }
  });
});

describe('verifyArchive', () => {
  it('detects a tampered file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-'));
    const text = '{"id":"a"}\n';
    const { createHash } = require('crypto');
    fs.writeFileSync(path.join(dir, 'orders.jsonl'), text);
    const manifest = {
      formatVersion: 1, createdAt: '', sourceEndpointHost: '', sourceDatabase: '',
      containers: [{ container: 'orders', file: 'orders.jsonl', count: 1, sha256: createHash('sha256').update(text).digest('hex') }],
    };
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
    expect(verifyArchive(dir).containers[0].count).toBe(1);
    fs.writeFileSync(path.join(dir, 'orders.jsonl'), '{"id":"b"}\n');
    expect(() => verifyArchive(dir)).toThrow(/checksum/);
  });
});
