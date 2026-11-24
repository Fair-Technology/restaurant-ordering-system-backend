import { describe, expect, it } from 'vitest';
import { mapResultToHttp } from '../../src/functions/_shared/mapResultToHttp';

describe('mapResultToHttp', () => {
  it('maps RATE_LIMITED to 429 with the code in the body', () => {
    expect(mapResultToHttp({ ok: false, code: 'RATE_LIMITED', error: 'slow down' })).toEqual({
      status: 429,
      jsonBody: { error: 'slow down', code: 'RATE_LIMITED' },
    });
  });
});
