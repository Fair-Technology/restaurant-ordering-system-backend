import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({
  findShopBySlug: vi.fn(),
}));
vi.mock('../../../src/infrastructure/cosmos/system/CosmosPlatformLegalIdentityRepository', async () => {
  const { COMPLETE_IDENTITY } = await import('../../fixtures/legal');
  return { getPlatformLegalIdentity: vi.fn(async () => COMPLETE_IDENTITY) };
});

import { findShopBySlug } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { executeGetPublicLegalPack } from '../../../src/application/legal/getPublicLegalPack/executeGetPublicLegalPack';
import { executeGetDpaDocument } from '../../../src/application/legal/getDpaDocument/executeGetDpaDocument';
import { COMPLETE_LEGAL } from '../../fixtures/legal';

describe('executeGetPublicLegalPack', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns legal pages for a paused shop', async () => {
    (findShopBySlug as any).mockResolvedValue({
      id: 's',
      slug: 'p',
      name: 'Pizzeria',
      countryCode: 'DE',
      isPaused: true,
      legal: COMPLETE_LEGAL,
    });
    const r: any = await executeGetPublicLegalPack({ slug: 'p', lang: 'de' });
    expect(r.ok).toBe(true);
    expect(r.data.impressum.lines[0]).toEqual({ label: 'Anbieter', value: 'Ma Pasta GmbH' });
    expect(r.data.terms.revision).toBe(1);
    expect(r.data.privacyNotice.isDraft).toBe(true);
    expect(r.data.seller).toEqual({ legalName: 'Ma Pasta GmbH', phone: '069 1234567' });
  });

  it('unknown slug is NOT_FOUND', async () => {
    (findShopBySlug as any).mockResolvedValue(null);
    expect(await executeGetPublicLegalPack({ slug: 'nope' })).toEqual({
      ok: false,
      code: 'NOT_FOUND',
      error: 'Shop not found',
    });
  });

  it('incomplete impressum hides impressum and privacy notice', async () => {
    (findShopBySlug as any).mockResolvedValue({ id: 's', slug: 'p', name: 'Pizzeria', countryCode: 'DE' });
    const r: any = await executeGetPublicLegalPack({ slug: 'p' });
    expect(r.data).toMatchObject({
      impressum: null,
      privacyNotice: null,
      terms: null,
      seller: { legalName: 'Pizzeria', phone: null },
    });
  });

  it('unsupported language falls back to German for a DE shop', async () => {
    (findShopBySlug as any).mockResolvedValue({ id: 's', slug: 'p', name: 'Pizzeria', countryCode: 'DE' });
    const r: any = await executeGetPublicLegalPack({ slug: 'p', lang: 'fr' });
    expect(r.data.language).toBe('de');
  });

  it('falls back to English for a non-German shop', async () => {
    (findShopBySlug as any).mockResolvedValue({ id: 's', slug: 'p', name: 'Pizzeria', countryCode: 'AU' });
    const r: any = await executeGetPublicLegalPack({ slug: 'p' });
    expect(r.data.language).toBe('en');
  });
});

describe('executeGetDpaDocument', () => {
  it('returns the current agreement when no version is given', async () => {
    const r: any = await executeGetDpaDocument({});
    expect(r.ok).toBe(true);
    expect(r.data.isDraft).toBe(true);
  });

  it('unknown version is NOT_FOUND', async () => {
    expect(await executeGetDpaDocument({ version: 'nope' })).toEqual({
      ok: false,
      code: 'NOT_FOUND',
      error: 'Unknown agreement version',
    });
  });
});
