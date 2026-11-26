import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({ findShopById: vi.fn() }));
vi.mock('../../../src/infrastructure/auth/principal', () => ({ authenticate: vi.fn() }));
vi.mock('../../../src/application/_shared/shopAccess', () => ({
  realDeps: {},
  resolveShopAccess: vi.fn(),
}));
vi.mock('../../../src/infrastructure/cosmos/system/CosmosSystemConfigRepository', () => ({
  getSystemConfig: vi.fn(),
}));

import { executeGetShop } from '../../../src/application/shop/getShop/executeGetShop';
import { findShopById } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { authenticate } from '../../../src/infrastructure/auth/principal';
import { resolveShopAccess } from '../../../src/application/_shared/shopAccess';
import { getSystemConfig } from '../../../src/infrastructure/cosmos/system/CosmosSystemConfigRepository';
import { CARD_SHOP } from '../../fixtures/orders';

const http = {} as any;

describe('executeGetShop scheduleHorizonDays', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authenticate as any).mockResolvedValue({ kind: 'staff', shopId: CARD_SHOP.id });
    (findShopById as any).mockResolvedValue(CARD_SHOP);
    (resolveShopAccess as any).mockResolvedValue({ actor: { actorType: 'staff', role: 'owner' }, permissions: [] });
  });

  it('returns the platform scheduleHorizonDays', async () => {
    (getSystemConfig as any).mockResolvedValue({ id: 'global', scheduleHorizonDays: 6 });
    const result = await executeGetShop({ shopId: CARD_SHOP.id }, http);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.scheduleHorizonDays).toBe(6);
  });

  it('falls back to the default (4) when the setting is unset', async () => {
    (getSystemConfig as any).mockResolvedValue({ id: 'global' });
    const result = await executeGetShop({ shopId: CARD_SHOP.id }, http);
    expect(result.ok && result.data.scheduleHorizonDays).toBe(4);
  });

  it('still returns the shop when the config cannot be read', async () => {
    (getSystemConfig as any).mockRejectedValue(new Error('cosmos down'));
    const result = await executeGetShop({ shopId: CARD_SHOP.id }, http);
    expect(result.ok && result.data.scheduleHorizonDays).toBe(4);
  });
});

describe('executeGetShop addressLocked', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authenticate as any).mockResolvedValue({ kind: 'staff', shopId: CARD_SHOP.id });
    (resolveShopAccess as any).mockResolvedValue({ actor: { actorType: 'staff', role: 'owner' }, permissions: [] });
    (getSystemConfig as any).mockResolvedValue({ id: 'global' });
  });

  it('is true for a complete address and false for an incomplete one', async () => {
    const full = { street: 'A 1', city: 'B', state: 'Bayern', postcode: '1', country: 'Germany' };
    (findShopById as any).mockResolvedValue({ ...CARD_SHOP, countryCode: 'DE', address: full });
    const locked = await executeGetShop({ shopId: CARD_SHOP.id }, http);
    expect(locked.ok && locked.data.addressLocked).toBe(true);

    (findShopById as any).mockResolvedValue({ ...CARD_SHOP, countryCode: 'DE', address: { city: 'B' } });
    const open = await executeGetShop({ shopId: CARD_SHOP.id }, http);
    expect(open.ok && open.data.addressLocked).toBe(false);
  });
});
