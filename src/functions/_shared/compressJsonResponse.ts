import { createHash } from 'crypto';
import { brotliCompressSync, gzipSync } from 'zlib';
import { HttpRequest, HttpResponseInit } from '@azure/functions';

// Same 30s the admin/superadmin SPAs use for index.html: catalog data can change via menu edits.
export const CATALOG_CACHE_CONTROL = 'public, max-age=30, must-revalidate';

/**
 * JSON 200 response with a strong ETag, conditional-GET (304) support and brotli/gzip compression
 * negotiated from Accept-Encoding. Opt-in per route; mapResultToHttp is intentionally untouched.
 */
export function compressJsonResponse(request: HttpRequest, data: unknown): HttpResponseInit {
  const json = JSON.stringify(data);
  const etag = `"${createHash('sha256').update(json).digest('hex')}"`;
  const cacheHeaders = { ETag: etag, 'Cache-Control': CATALOG_CACHE_CONTROL, Vary: 'Accept-Encoding' };

  if (request.headers.get('if-none-match') === etag) {
    return { status: 304, headers: cacheHeaders };
  }

  const acceptEncoding = (request.headers.get('accept-encoding') ?? '').toLowerCase();
  const headers: Record<string, string> = {
    ...cacheHeaders,
    'Content-Type': 'application/json; charset=utf-8',
  };

  if (acceptEncoding.includes('br')) {
    headers['Content-Encoding'] = 'br';
    return { status: 200, headers, body: brotliCompressSync(json) };
  }
  if (acceptEncoding.includes('gzip')) {
    headers['Content-Encoding'] = 'gzip';
    return { status: 200, headers, body: gzipSync(json) };
  }
  return { status: 200, headers, body: json };
}
