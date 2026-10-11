import { describe, expect, it } from 'vitest';
import { wouldRemoveLastProductImage } from '../../src/domain/images/imageRules';
import { mapResultToHttp } from '../../src/functions/_shared/mapResultToHttp';

const img = (id: string) => ({ id, url: `https://x/${id}.jpg` });

describe('wouldRemoveLastProductImage', () => {
  it('refuses emptying the list of a dish that has a photo', () => {
    expect(wouldRemoveLastProductImage([img('a')], [])).toBe(true);
  });
  it('allows replacing: add the new photo, then drop the old one', () => {
    expect(wouldRemoveLastProductImage([img('a')], [img('a'), img('b')])).toBe(false);
    expect(wouldRemoveLastProductImage([img('a'), img('b')], [img('b')])).toBe(false);
  });
  it('ignores updates that do not touch images, and dishes that never had one', () => {
    expect(wouldRemoveLastProductImage([img('a')], undefined)).toBe(false);
    expect(wouldRemoveLastProductImage([], [])).toBe(false);
    expect(wouldRemoveLastProductImage(undefined, [])).toBe(false);
  });
});

describe('PRODUCT_IMAGE_REQUIRED over HTTP', () => {
  it('answers 409 with { error, code }', () => {
    const res = mapResultToHttp({ ok: false, code: 'PRODUCT_IMAGE_REQUIRED', error: 'nope' });
    expect(res.status).toBe(409);
    expect(res.jsonBody).toEqual({ error: 'nope', code: 'PRODUCT_IMAGE_REQUIRED' });
  });
});
