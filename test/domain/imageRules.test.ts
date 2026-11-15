import { describe, it, expect } from 'vitest';
import { COVER_IMAGE_SIZE, PRODUCT_IMAGE_SIZE } from '../../src/domain/images/imageRules';
import { mapResultToHttp } from '../../src/functions/_shared/mapResultToHttp';

describe('image rules and HTTP shape', () => {
  it('sizes', () => {
    expect(COVER_IMAGE_SIZE).toEqual({ width: 1920, height: 640 });
    expect(PRODUCT_IMAGE_SIZE).toEqual({ width: 1200, height: 900 });
  });

  it.each(['COVER_IMAGE_WRONG_SIZE', 'PRODUCT_IMAGE_WRONG_SIZE'])('%s answers 400 with { error, code }', (code) => {
    expect(mapResultToHttp({ ok: false, code, error: 'msg' })).toEqual({ status: 400, jsonBody: { error: 'msg', code } });
  });
});
