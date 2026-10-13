import { describe, it, expect, vi } from 'vitest';

vi.hoisted(() => {
  process.env.STORAGE_ACCOUNT_NAME = 'testaccount';
  process.env.STORAGE_ACCOUNT_KEY = Buffer.from('test-key').toString('base64');
});

import { generateUploadSasUrl } from '../../src/infrastructure/storage/blobStorageHelpers';

describe('upload link', () => {
  it('upload link is create-only, https-only, one blob, at most 10 minutes', () => {
    const t0 = Date.now();
    const q = new URL(generateUploadSasUrl('shops/s/products/p/i.jpg').sasUrl).searchParams;
    expect(q.get('sp')).toBe('c');
    expect(q.get('sr')).toBe('b');
    expect(q.get('spr')).toBe('https');
    expect((Date.parse(q.get('se')!) - t0) / 60000).toBeLessThanOrEqual(10.1);
  });
});
