import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/application/_shared/shopAccess', () => ({
  authorizeShopAction: vi.fn(async () => ({ ok: true, actor: { actorType: 'owner', actorId: 'u1' }, permissions: ['manage_shop'] })),
  toAuditActor: (a: any) => ({ actorType: a.actorType, actorId: a.actorId }),
}));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({
  findShopById: vi.fn(async () => ({
    id: 'shop-1', name: 'P', slug: 'p', isDeleted: false, createdAt: 'x', updatedAt: 'x',
    branding: { logoUrl: null, heroImageUrl: 'https://x/h.jpg', accentColor: null, showHero: false },
  })),
  updateShop: vi.fn(async (s: any) => s),
}));
vi.mock('../../../src/application/_shared/auditHelpers', () => ({ logAudit: vi.fn(), diffFields: vi.fn(() => []) }));
vi.mock('../../../src/infrastructure/storage/blobStorageHelpers', () => ({
  deleteBlob: vi.fn(async () => {}),
  extractBlobPath: () => null,
}));

import { executeSetShopLogo } from '../../../src/application/shop/setShopLogo/executeSetShopLogo';
import { updateShop } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';

describe('logo upload and the banner switch', () => {
  it('keeps showHero=false and the cover picture when the logo changes', async () => {
    await executeSetShopLogo({ shopId: 'shop-1', imageId: 'i', url: 'https://x/logo.png' } as any, {} as any);
    expect(updateShop).toHaveBeenCalledWith(
      expect.objectContaining({ branding: expect.objectContaining({ logoUrl: 'https://x/logo.png', heroImageUrl: 'https://x/h.jpg', showHero: false }) }),
    );
  });
});
