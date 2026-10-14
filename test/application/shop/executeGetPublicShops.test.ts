import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({ findAllShops: vi.fn() }));

import { findAllShops } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { executeGetPublicShops } from '../../../src/application/shop/getPublicShops/executeGetPublicShops';
import { CARD_SHOP, LUNCH_HOURS } from '../../fixtures/orders';

const mockFind = vi.mocked(findAllShops);

const full = {
  ...CARD_SHOP,
  id: 'A',
  slug: 'alte-muehle',
  name: 'Alte Mühle',
  address: { street: 'Hauptstr. 1', city: ' Berlin ', state: 'BE', postcode: '10115', country: 'DE' },
  branding: { logoUrl: 'https://x/l.png', heroImageUrl: null, accentColor: '#112233', primaryColor: '#000' } as any,
  ordersPaused: true,
  ordersPausedMessage: 'Back at 6',
  offlineBySuperadminReason: 'internal',
};

describe('executeGetPublicShops', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns only public fields', async () => {
    mockFind.mockResolvedValue([full]);
    const res: any = await executeGetPublicShops();
    expect(res.ok).toBe(true);
    expect(res.data.shops).toEqual([
      {
        id: 'A',
        slug: 'alte-muehle',
        name: 'Alte Mühle',
        address: { city: 'Berlin', postcode: '10115' },
        branding: { logoUrl: 'https://x/l.png', heroImageUrl: null, accentColor: '#112233', showHero: true },
        openingHours: LUNCH_HOURS,
        timezone: 'Europe/Berlin',
        ordersPaused: true,
      },
    ]);
    expect(Object.keys(res.data.shops[0]).sort()).toEqual([
      'address', 'branding', 'id', 'name', 'openingHours', 'ordersPaused', 'slug', 'timezone',
    ]);
    const json = JSON.stringify(res.data);
    for (const secret of ['acct_1', 'internal', 'Back at 6', 'Hauptstr', 'u1']) {
      expect(json).not.toContain(secret);
    }
  });

  it('leaves out deleted, owner-offline and platform-offline shops', async () => {
    mockFind.mockResolvedValue([
      { ...CARD_SHOP, id: 'ok' },
      { ...CARD_SHOP, id: 'del', isDeleted: true },
      { ...CARD_SHOP, id: 'paused', isPaused: true },
      { ...CARD_SHOP, id: 'plat', offlineBySuperadmin: true },
    ]);
    const res: any = await executeGetPublicShops();
    expect(res.data.shops.map((s: any) => s.id)).toEqual(['ok']);
  });

  it('keeps a shop that only paused orders', async () => {
    mockFind.mockResolvedValue([{ ...CARD_SHOP, id: 'op', ordersPaused: true }]);
    const res: any = await executeGetPublicShops();
    expect(res.data.shops.map((s: any) => s.id)).toEqual(['op']);
    expect(res.data.shops[0].ordersPaused).toBe(true);
  });

  it('older shops without the newer fields read as defaults', async () => {
    const old: any = { ...CARD_SHOP, address: undefined, branding: undefined, openingHours: undefined };
    delete old.ordersPaused;
    mockFind.mockResolvedValue([old]);
    const res: any = await executeGetPublicShops();
    expect(res.data.shops[0]).toMatchObject({
      ordersPaused: false,
      branding: null,
      address: { city: null, postcode: null },
      openingHours: {},
    });
  });

  it('sorted by name', async () => {
    mockFind.mockResolvedValue(['Zur Post', 'Ma Pasta', 'alte Mühle'].map((name, i) => ({ ...CARD_SHOP, id: String(i), name })));
    const res: any = await executeGetPublicShops();
    expect(res.data.shops.map((s: any) => s.name)).toEqual(['alte Mühle', 'Ma Pasta', 'Zur Post']);
  });

  it('a database failure is an internal error', async () => {
    mockFind.mockRejectedValue(new Error('cosmos down'));
    const res: any = await executeGetPublicShops();
    expect(res.ok).toBe(false);
    expect(res.code).toBe('INTERNAL_ERROR');
  });
});
