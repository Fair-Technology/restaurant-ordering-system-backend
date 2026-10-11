import { describe, expect, it } from 'vitest';
import { mergeProductImages, wouldRemoveLastProductImage } from '../../src/domain/images/imageRules';
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

describe('mergeProductImages', () => {
  it('fills a shrunk list from the stored photo with the same id', () => {
    const stored = [
      { id: 'a', url: 'https://x/a.jpg', createdAt: '2026-01-01' },
      { id: 'b', url: 'https://x/b.jpg', createdAt: '2026-02-02', sortOrder: 1 },
    ];
    expect(mergeProductImages(stored, [{ id: 'b', url: 'https://x/b.jpg' }])).toEqual([stored[1]]);
  });
  it('keeps unknown ids as sent', () => {
    expect(mergeProductImages([], [{ id: 'n', url: 'u' }])).toEqual([{ id: 'n', url: 'u' }]);
  });
});
