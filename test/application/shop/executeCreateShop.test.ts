import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({
  createShop: vi.fn(async (s: any) => s),
  isSlugReservedByAnother: vi.fn(async () => false),
  findOwnedShopIds: vi.fn(async () => []),
}));
vi.mock('../../../src/infrastructure/auth/authHelpers', () => ({
  getPrincipalFromAuth: vi.fn(async () => ({ kind: 'entra', userId: 'user-1', issuer: 'customer', roles: [] })),
}));
vi.mock('../../../src/infrastructure/auth/superAdminAuthHelpers', () => ({
  isSuperAdminPrincipal: vi.fn(async () => false),
}));
vi.mock('../../../src/infrastructure/cosmos/user/CosmosUserRepository', () => ({
  findUserById: vi.fn(async () => ({ maxShops: null })),
}));
vi.mock('../../../src/infrastructure/cosmos/system/CosmosSystemConfigRepository', () => ({
  getSystemConfig: vi.fn(async () => ({ maxShopsDefault: 3 })),
}));
vi.mock('../../../src/infrastructure/cosmos/subscription/CosmosSubscriptionRepository', () => ({
  upsertSubscription: vi.fn(async () => undefined),
}));
vi.mock('../../../src/infrastructure/cosmos/usage/CosmosUsageRepository', () => ({
  upsertUsage: vi.fn(async () => undefined),
}));
vi.mock('../../../src/infrastructure/cosmos/plan/CosmosPlanRepository', () => ({
  findDefaultPlan: vi.fn(async () => ({ id: 'plan-free' })),
}));
vi.mock('../../../src/infrastructure/cosmos/optionGroup/CosmosShopOptionGroupRepository', () => ({
  createShopOptionGroup: vi.fn(async (g: any) => g),
}));
vi.mock('../../../src/application/_shared/logServiceFailure', () => ({ logServiceFailure: vi.fn() }));

import { createShopOptionGroup } from '../../../src/infrastructure/cosmos/optionGroup/CosmosShopOptionGroupRepository';
import { logServiceFailure } from '../../../src/application/_shared/logServiceFailure';
import { createShop as createShopInRepo, isSlugReservedByAnother } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { CURRENT_DPA } from '../../../src/domain/legal/platformDocuments';
import { executeCreateShop } from '../../../src/application/shop/createShop/executeCreateShop';

function baseRequest(overrides: any = {}) {
  return {
    name: 'Pizzeria Napoli',
    industry: 'restaurant',
    countryCode: 'DE',
    currency: 'EUR',
    timezone: 'Europe/Berlin',
    minOrderAmountCents: 1000,
    address: { street: 'Main St 1', city: 'Berlin', state: 'Berlin', postcode: '10115', country: 'Germany' },
    openingHours: { mon: [{ open: '09:00', close: '17:00' }], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] },
    ...overrides,
  };
}

describe('executeCreateShop payment policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (createShopInRepo as any).mockImplementation(async (s: any) => s);
  });

  it('persists a new shop with openingHoursConfirmed: false', async () => {
    const result = await executeCreateShop(baseRequest(), {} as any);

    expect(result.ok).toBe(true);
    expect(createShopInRepo).toHaveBeenCalledWith(expect.objectContaining({ openingHoursConfirmed: false }));
  });

  it('ignores a client-sent openingHoursConfirmed', async () => {
    await executeCreateShop(baseRequest({ openingHoursConfirmed: true }), {} as any);

    expect(createShopInRepo).toHaveBeenCalledWith(expect.objectContaining({ openingHoursConfirmed: false }));
  });

  it('ignores a paymentPolicy sent by an older admin', async () => {
    const result = await executeCreateShop(baseRequest({ paymentPolicy: 'pay_in_person' }), {} as any);

    expect(result.ok).toBe(true);
    expect(createShopInRepo).toHaveBeenCalledWith(expect.not.objectContaining({ paymentPolicy: expect.anything() }));
  });
});

describe('executeCreateShop DPA acceptance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (createShopInRepo as any).mockImplementation(async (s: any) => s);
  });

  it('records DPA acceptance when the current version is sent', async () => {
    const result = await executeCreateShop(baseRequest({ acceptDpaVersion: CURRENT_DPA.version }), {} as any);

    expect(result.ok).toBe(true);
    expect(createShopInRepo).toHaveBeenCalledWith(
      expect.objectContaining({
        dpaAcceptance: expect.objectContaining({
          version: CURRENT_DPA.version,
          acceptedByUserId: 'user-1',
          shopNameAtAcceptance: 'Pizzeria Napoli',
        }),
      }),
    );
  });

  it('rejects an outdated DPA version', async () => {
    const result = await executeCreateShop(baseRequest({ acceptDpaVersion: '2025-01-01' }), {} as any);

    expect(result).toMatchObject({
      ok: false,
      code: 'INVALID_INPUT',
      error: 'The data processing agreement has changed — reload and accept the current version',
    });
    expect(createShopInRepo).not.toHaveBeenCalled();
  });

  it('leaves dpaAcceptance null when none is sent', async () => {
    await executeCreateShop(baseRequest(), {} as any);

    expect(createShopInRepo).toHaveBeenCalledWith(
      expect.objectContaining({ dpaAcceptance: null, dpaAcceptanceHistory: [] }),
    );
  });
});

describe('executeCreateShop primary menu language', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (createShopInRepo as any).mockImplementation(async (s: any) => s);
  });

  it('uses the chosen menuLanguage even for a German shop', async () => {
    const result = await executeCreateShop(baseRequest({ menuLanguage: 'en' }), {} as any);

    expect(result.ok).toBe(true);
    expect(createShopInRepo).toHaveBeenCalledWith(expect.objectContaining({ menuLanguages: ['en'] }));
  });

  it('falls back to the country default when menuLanguage is absent', async () => {
    await executeCreateShop(baseRequest(), {} as any);
    expect(createShopInRepo).toHaveBeenCalledWith(expect.objectContaining({ menuLanguages: ['de'] }));

    vi.clearAllMocks();
    await executeCreateShop(baseRequest({ countryCode: 'AU' }), {} as any);
    expect(createShopInRepo).toHaveBeenCalledWith(expect.objectContaining({ menuLanguages: ['en'] }));
  });

  it('rejects an unsupported menuLanguage', async () => {
    const result = await executeCreateShop(baseRequest({ menuLanguage: 'fr' }), {} as any);

    expect(result).toEqual({ ok: false, code: 'INVALID_INPUT', error: 'menuLanguage must be one of: de, en' });
    expect(createShopInRepo).not.toHaveBeenCalled();
  });
});

describe('executeCreateShop reserved slugs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refuses a name whose link is live or retired on another shop', async () => {
    (isSlugReservedByAnother as any).mockResolvedValueOnce(true);
    const result = await executeCreateShop(baseRequest(), {} as any);

    expect(result).toMatchObject({ ok: false, code: 'INVALID_INPUT', error: 'A shop with this name already exists', errorCode: 'SHOP_NAME_EXISTS', field: 'name' });
    expect(createShopInRepo).not.toHaveBeenCalled();
  });
});

describe('executeCreateShop owner-typed slug and name length', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (createShopInRepo as any).mockImplementation(async (s: any) => s);
    (isSlugReservedByAnother as any).mockResolvedValue(false);
  });

  it('uses a typed slug when available', async () => {
    const result = await executeCreateShop(baseRequest({ slug: '  my-place ' }), {} as any);
    expect(result.ok).toBe(true);
    expect(isSlugReservedByAnother).toHaveBeenCalledWith('my-place');
    expect(createShopInRepo).toHaveBeenCalledWith(expect.objectContaining({ slug: 'my-place' }));
  });

  it('rejects a malformed typed slug', async () => {
    const result = await executeCreateShop(baseRequest({ slug: 'Bad_Slug' }), {} as any);
    expect(result).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(createShopInRepo).not.toHaveBeenCalled();
  });

  it('rejects an empty typed slug', async () => {
    const result = await executeCreateShop(baseRequest({ slug: '' }), {} as any);
    expect(result).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
  });

  it('rejects a taken typed slug', async () => {
    (isSlugReservedByAnother as any).mockResolvedValueOnce(true);
    const result = await executeCreateShop(baseRequest({ slug: 'taken' }), {} as any);
    expect(result).toMatchObject({
      ok: false,
      code: 'INVALID_INPUT',
      error: 'This link is already taken. Please choose another.',
    });
    expect(createShopInRepo).not.toHaveBeenCalled();
  });

  it('falls back to a generated slug when none is sent', async () => {
    const result = await executeCreateShop(baseRequest(), {} as any);
    expect(result.ok).toBe(true);
    expect(createShopInRepo).toHaveBeenCalledWith(expect.objectContaining({ slug: 'pizzeria-napoli' }));
  });

  it('refuses cleanly when no slug is sent and the name generates none', async () => {
    const result = await executeCreateShop(baseRequest({ name: '寿司屋' }), {} as any);
    expect(result).toEqual({
      ok: false,
      code: 'INVALID_INPUT',
      error: 'Could not generate a link from this name; please choose one',
    });
  });

  it('accepts a non-Latin name when a slug is typed', async () => {
    const result = await executeCreateShop(baseRequest({ name: '寿司屋', slug: 'sushi-ya' }), {} as any);
    expect(result.ok).toBe(true);
  });

  it('allows an 80-character name and rejects 81', async () => {
    expect((await executeCreateShop(baseRequest({ name: 'a'.repeat(80) }), {} as any)).ok).toBe(true);
    const res = await executeCreateShop(baseRequest({ name: 'a'.repeat(81) }), {} as any);
    expect(res).toEqual({ ok: false, code: 'INVALID_INPUT', error: 'Shop name must be at most 80 characters long' });
  });
});

describe('executeCreateShop optional industry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (createShopInRepo as any).mockImplementation(async (s: any) => s);
  });

  it('creates a shop when industry is not sent', async () => {
    const result = await executeCreateShop(baseRequest({ industry: undefined }), {} as any);

    expect(result.ok).toBe(true);
    expect(createShopInRepo).toHaveBeenCalledTimes(1);
    expect((createShopInRepo as any).mock.calls[0][0].industry).toBeUndefined();
  });

  it('still stores a trimmed industry when an older client sends one', async () => {
    const result = await executeCreateShop(baseRequest({ industry: '  restaurant  ' }), {} as any);

    expect(result.ok).toBe(true);
    expect(createShopInRepo).toHaveBeenCalledWith(expect.objectContaining({ industry: 'restaurant' }));
  });
});

describe('executeCreateShop default option-group seeding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (createShopInRepo as any).mockImplementation(async (s: any) => s);
    (createShopOptionGroup as any).mockImplementation(async (g: any) => g);
  });

  it('seeds a Size variant group and an Extras add-on group', async () => {
    const result = await executeCreateShop(baseRequest({ menuLanguage: 'en' }), {} as any);
    expect(result.ok).toBe(true);
    const shopId = (result as any).data.id;
    expect(createShopOptionGroup).toHaveBeenCalledTimes(2);
    expect(createShopOptionGroup).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'variant', name: 'Size', shopId, isDeleted: false }),
    );
    expect(createShopOptionGroup).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'addon', name: 'Extras', shopId, isDeleted: false }),
    );
  });

  it('seeds German original names for a DE shop', async () => {
    await executeCreateShop(baseRequest(), {} as any);
    const names = (createShopOptionGroup as any).mock.calls.map((c: any[]) => c[0].name);
    expect(names).toEqual(['Größe', 'Extras']);
    const size = (createShopOptionGroup as any).mock.calls[0][0];
    expect(size.nameTranslations).toEqual({ en: 'Size' });
  });

  it('still succeeds, and logs, when seeding fails', async () => {
    (createShopOptionGroup as any).mockRejectedValueOnce(new Error('cosmos down'));
    const result = await executeCreateShop(baseRequest(), {} as any);
    expect(result.ok).toBe(true);
    expect(logServiceFailure).toHaveBeenCalledWith('seedDefaultOptionGroups', expect.any(Error));
  });
});
