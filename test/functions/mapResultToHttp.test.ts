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

  it('forwards errorCode/field on CONFLICT', () => {
    expect(mapResultToHttp({ ok: false, code: 'CONFLICT', error: 'dup', errorCode: 'CATEGORY_NAME_EXISTS', field: 'name' })).toEqual({
      status: 409,
      jsonBody: { error: 'dup', errorCode: 'CATEGORY_NAME_EXISTS', field: 'name' },
    });
  });

  it('forwards requestedCents/availableCents and keeps the branch code', () => {
    expect(
      mapResultToHttp({ ok: false, code: 'ORDERS_PAUSED', error: 'x', errorCode: 'E', requestedCents: 400, availableCents: 249 }).jsonBody,
    ).toEqual({ error: 'x', code: 'ORDERS_PAUSED', errorCode: 'E', requestedCents: 400, availableCents: 249 });
  });

  it('forwards structured fields on every mapped branch', () => {
    for (const code of ['NOT_FOUND', 'UNAUTHORIZED', 'FORBIDDEN', 'CONFLICT', 'OPEN_ORDERS', 'SHOP_ADDRESS_LOCKED', 'SHOP_OFFLINE_BY_SUPERADMIN', 'ORDERS_PAUSED', 'TAX_RATE_MISSING', 'PRODUCT_IMAGE_REQUIRED', 'PRODUCT_IMAGE_REQUIRED_TO_ENABLE', 'COMBO_IMAGE_REQUIRED_TO_ENABLE', 'COVER_IMAGE_WRONG_SIZE', 'PRODUCT_IMAGE_WRONG_SIZE', 'NOT_CONFIGURED', 'RATE_LIMITED', 'LIMIT_REACHED']) {
      const body = mapResultToHttp({ ok: false, code, error: 'e', errorCode: 'X', field: 'f', max: 1 }).jsonBody as any;
      expect(body, code).toMatchObject({ errorCode: 'X', field: 'f', max: 1 });
    }
  });
});
