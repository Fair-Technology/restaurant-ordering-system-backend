import { describe, expect, it } from 'vitest';
import { brotliDecompressSync, gunzipSync } from 'zlib';
import { compressJsonResponse } from '../../src/functions/_shared/compressJsonResponse';

const data = { categories: [{ id: 'c1', name: 'Mains', products: Array.from({ length: 50 }, (_, i) => ({ id: `p${i}`, name: 'Dish ' + i })) }] };
const json = JSON.stringify(data);

const req = (headers: Record<string, string> = {}) =>
  ({ headers: new Headers(headers) }) as any;

describe('compressJsonResponse', () => {
  it('sends uncompressed JSON without Accept-Encoding', () => {
    const res = compressJsonResponse(req(), data);
    expect(res.status).toBe(200);
    expect(res.body).toBe(json);
    const h = res.headers as Record<string, string>;
    expect(h['Content-Encoding']).toBeUndefined();
    expect(h.Vary).toBe('Accept-Encoding');
    expect(h['Content-Type']).toBe('application/json; charset=utf-8');
    expect(h['Cache-Control']).toBe('public, max-age=30, must-revalidate');
    expect(h.ETag).toMatch(/^"[0-9a-f]{64}"$/);
  });

  it('gzips when the client accepts gzip', () => {
    const res = compressJsonResponse(req({ 'Accept-Encoding': 'gzip' }), data);
    const h = res.headers as Record<string, string>;
    expect(h['Content-Encoding']).toBe('gzip');
    expect(h.Vary).toBe('Accept-Encoding');
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(gunzipSync(res.body as Buffer).toString('utf8')).toBe(json);
  });

  it('uses brotli when the client accepts br (preferred over gzip)', () => {
    const res = compressJsonResponse(req({ 'Accept-Encoding': 'gzip, br' }), data);
    const h = res.headers as Record<string, string>;
    expect(h['Content-Encoding']).toBe('br');
    expect(brotliDecompressSync(res.body as Buffer).toString('utf8')).toBe(json);
  });

  it('returns 304 with no body when If-None-Match matches the ETag', () => {
    const etag = (compressJsonResponse(req(), data).headers as Record<string, string>).ETag;
    const res = compressJsonResponse(req({ 'If-None-Match': etag, 'Accept-Encoding': 'br' }), data);
    expect(res.status).toBe(304);
    expect(res.body).toBeUndefined();
    const h = res.headers as Record<string, string>;
    expect(h.ETag).toBe(etag);
    expect(h['Cache-Control']).toBe('public, max-age=30, must-revalidate');
  });

  it('ignores a stale If-None-Match', () => {
    expect(compressJsonResponse(req({ 'If-None-Match': '"stale"' }), data).status).toBe(200);
  });
});
