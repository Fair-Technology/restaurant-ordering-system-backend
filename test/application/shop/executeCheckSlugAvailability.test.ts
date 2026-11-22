import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({
  isSlugReservedByAnother: vi.fn(async () => false),
}));

import { isSlugReservedByAnother } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { executeCheckSlugAvailability } from '../../../src/application/shop/checkSlugAvailability/executeCheckSlugAvailability';

describe('executeCheckSlugAvailability', () => {
  beforeEach(() => vi.clearAllMocks());

  it('is available for a free slug', async () => {
    const res = await executeCheckSlugAvailability({ slug: 'free-one' });
    expect(res).toEqual({ ok: true, data: { slug: 'free-one', available: true } });
  });

  it('is unavailable for a taken slug', async () => {
    (isSlugReservedByAnother as any).mockResolvedValueOnce(true);
    const res = await executeCheckSlugAvailability({ slug: 'taken' });
    expect(res).toEqual({ ok: true, data: { slug: 'taken', available: false } });
  });

  it('rejects a bad format without querying', async () => {
    const res = await executeCheckSlugAvailability({ slug: 'Bad_Slug' });
    expect(res).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(isSlugReservedByAnother).not.toHaveBeenCalled();
  });

  it('maps repository failure to INTERNAL_ERROR', async () => {
    (isSlugReservedByAnother as any).mockRejectedValueOnce(new Error('boom'));
    const res = await executeCheckSlugAvailability({ slug: 'ok' });
    expect(res).toMatchObject({ ok: false, code: 'INTERNAL_ERROR' });
  });
});
