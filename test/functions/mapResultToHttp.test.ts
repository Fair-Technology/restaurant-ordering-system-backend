import { describe, expect, it } from 'vitest';
import { mapResultToHttp } from '../../src/functions/_shared/mapResultToHttp';

describe('mapResultToHttp', () => {
  it('maps RATE_LIMITED to 429 with the code in the body', () => {
    expect(mapResultToHttp({ ok: false, code: 'RATE_LIMITED', error: 'slow down' })).toEqual({
      status: 429,
      jsonBody: { error: 'slow down', code: 'RATE_LIMITED' },
    });
  });

  it('forwards errorCode/field/max on INVALID_INPUT', () => {
    expect(
      mapResultToHttp({ ok: false, code: 'INVALID_INPUT', error: 'bad', errorCode: 'too_long', field: 'impressum.name', max: 80 }),
    ).toEqual({
      status: 400,
      jsonBody: { error: 'bad', errorCode: 'too_long', field: 'impressum.name', max: 80 },
    });
  });

  it('keeps a plain INVALID_INPUT body to just error, with no undefined keys', () => {
    const res = mapResultToHttp({ ok: false, code: 'INVALID_INPUT', error: 'bad' });
    expect(res.jsonBody).toEqual({ error: 'bad' });
    expect(Object.keys(res.jsonBody as object)).toEqual(['error']);
  });
});
