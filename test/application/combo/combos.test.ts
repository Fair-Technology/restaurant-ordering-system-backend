import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/application/_shared/shopAccess', () => ({
  authorizeShopAction: vi.fn(),
  toAuditActor: (a: { actorType: string; actorId: string }) => ({ actorType: a.actorType, actorId: a.actorId }),
}));
vi.mock('../../../src/application/_shared/auditHelpers', async (orig) => ({
  ...(await orig<object>()),
  logAudit: vi.fn(async () => undefined),
}));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({ findShopById: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/product/CosmosProductRepository', () => ({
  findProductsByShopId: vi.fn(),
  findProductById: vi.fn(),
  createProduct: vi.fn(async (p: unknown) => p),
  updateProduct: vi.fn(async (p: unknown) => p),
}));
vi.mock('../../../src/infrastructure/cosmos/category/CosmosCategoryRepository', () => ({ findCategoriesByShopId: vi.fn() }));

import { logAudit } from '../../../src/application/_shared/auditHelpers';
import { authorizeShopAction } from '../../../src/application/_shared/shopAccess';
import { executeCreateCombo } from '../../../src/application/combo/createCombo/executeCreateCombo';
import { executeGetCombos } from '../../../src/application/combo/getCombos/executeGetCombos';
import { executeUpdateCombo } from '../../../src/application/combo/updateCombo/executeUpdateCombo';
import { COMBO_BMF_ERROR, COMBO_DISH_ERROR, COMBO_NOT_FOUND_ERROR } from '../../../src/domain/product/combo';
import { findCategoriesByShopId } from '../../../src/infrastructure/cosmos/category/CosmosCategoryRepository';
import { createProduct, findProductById, findProductsByShopId, updateProduct } from '../../../src/infrastructure/cosmos/product/CosmosProductRepository';
import { findShopById } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { CARD_SHOP, CATEGORIES, P_COLA, P_COMBO, P_PASTA, P_SALAD } from '../../fixtures/orders';

const MENU_EDITOR = { ok: true, actor: { actorType: 'staff', actorId: 'm1', role: 'manager' }, permissions: ['manage_menu'] };
const now = new Date('2026-10-09T10:00:00Z');
const http = {} as any;
const body = {
  name: 'Pasta-Menü',
  priceCents: 1200,
  categoryId: 'pasta',
  groups: [
    { name: 'Hauptgericht', productIds: ['p1', 'p3'] },
    { name: 'Getränk', productIds: ['p2'] },
  ],
};

describe('combo endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (findShopById as any).mockResolvedValue(CARD_SHOP);
    (authorizeShopAction as any).mockResolvedValue(MENU_EDITOR);
    (findCategoriesByShopId as any).mockResolvedValue(CATEGORIES);
    (findProductsByShopId as any).mockResolvedValue([P_PASTA, P_COLA, P_SALAD, P_COMBO]);
    (findProductById as any).mockResolvedValue(P_COMBO);
  });

  it('someone who edits the menu creates a combo', async () => {
    const res = await executeCreateCombo({ shopId: 'shop-1', body, now }, http);
    expect(res.ok).toBe(true);
    expect(authorizeShopAction).toHaveBeenCalledWith(http, CARD_SHOP, 'manage_menu');
    expect(createProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: 'shop-1',
        name: 'Pasta-Menü',
        price: 1200,
        categoryIds: ['pasta'],
        allergenIds: [],
        additiveIds: [],
        images: [],
        isAvailable: true,
        isDeleted: false,
        createdAt: '2026-10-09T10:00:00.000Z',
        combo: {
          groups: [
            expect.objectContaining({ name: 'Hauptgericht', productIds: ['p1', 'p3'] }),
            expect.objectContaining({ name: 'Getränk', productIds: ['p2'] }),
          ],
          bmfDrinkShare: false,
        },
      }),
    );
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'combo.create',
        entityType: 'product',
        entityName: 'Pasta-Menü',
        changes: [{ field: 'name', from: null, to: 'Pasta-Menü' }],
      }),
    );
    expect(res.ok && res.data).toMatchObject({ name: 'Pasta-Menü', priceCents: 1200, categoryId: 'pasta', bmfDrinkShare: false, isAvailable: true });
  });

  it("a combo can only hold the restaurant's dishes", async () => {
    const res = await executeCreateCombo({ shopId: 'shop-1', body: { ...body, groups: [{ name: 'A', productIds: ['p9'] }] }, now }, http);
    expect(res).toEqual({ ok: false, code: 'INVALID_INPUT', error: COMBO_DISH_ERROR });
    expect(createProduct).not.toHaveBeenCalled();
  });

  it('the BMF option is only for German restaurants', async () => {
    (findShopById as any).mockResolvedValue({ ...CARD_SHOP, countryCode: 'AT' });
    const res = await executeCreateCombo({ shopId: 'shop-1', body: { ...body, bmfDrinkShare: true }, now }, http);
    expect(res).toEqual({ ok: false, code: 'INVALID_INPUT', error: COMBO_BMF_ERROR });
  });

  it('editing keeps the group ids and logs what changed', async () => {
    const res = await executeUpdateCombo(
      {
        shopId: 'shop-1',
        comboId: 'p9',
        body: {
          name: 'Pasta-Menü',
          priceCents: 1300,
          categoryId: 'pasta',
          groups: [
            { id: 'g-main', name: 'Hauptgericht', productIds: ['p1'] },
            { id: 'g-drink', name: 'Getränk', productIds: ['p2'] },
          ],
        },
        now,
      },
      http,
    );
    expect(res.ok).toBe(true);
    expect(updateProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'p9',
        price: 1300,
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-10-09T10:00:00.000Z',
        combo: {
          groups: [
            { id: 'g-main', name: 'Hauptgericht', productIds: ['p1'] },
            { id: 'g-drink', name: 'Getränk', productIds: ['p2'] },
          ],
          bmfDrinkShare: false,
        },
      }),
    );
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'combo.update',
        changes: [
          { field: 'price', from: 1200, to: 1300 },
          { field: 'combo', from: '[updated]', to: '[updated]' },
        ],
      }),
    );
  });

  it('a dish is not a combo', async () => {
    (findProductById as any).mockResolvedValue(P_PASTA);
    const dish = await executeUpdateCombo({ shopId: 'shop-1', comboId: 'p1', body, now }, http);
    expect(dish).toEqual({ ok: false, code: 'NOT_FOUND', error: COMBO_NOT_FOUND_ERROR });
    (findProductById as any).mockResolvedValue({ ...P_COMBO, isDeleted: true });
    const gone = await executeUpdateCombo({ shopId: 'shop-1', comboId: 'p9', body, now }, http);
    expect(gone).toEqual({ ok: false, code: 'NOT_FOUND', error: COMBO_NOT_FOUND_ERROR });
    expect(updateProduct).not.toHaveBeenCalled();
  });

  it('only people who edit the menu', async () => {
    const denied = { ok: false, code: 'FORBIDDEN', error: 'Forbidden' };
    (authorizeShopAction as any).mockResolvedValue(denied);
    expect(await executeCreateCombo({ shopId: 'shop-1', body, now }, http)).toEqual(denied);
    expect(createProduct).not.toHaveBeenCalled();
  });

  it('lists only the combos', async () => {
    (findProductsByShopId as any).mockResolvedValue([P_PASTA, P_COMBO]);
    const res = await executeGetCombos({ shopId: 'shop-1' }, http);
    expect(res.ok && res.data).toEqual([
      {
        id: 'p9',
        name: 'Pasta-Menü',
        description: '',
        nameTranslations: {},
        descriptionTranslations: {},
        images: [],
        priceCents: 1200,
        categoryId: 'pasta',
        isAvailable: true,
        bmfDrinkShare: false,
        groups: P_COMBO.combo!.groups.map((g) => ({ ...g, nameTranslations: {} })),
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
      },
    ]);
  });

  describe('translations', () => {
    const tBody = {
      ...body,
      nameTranslations: { en: ' Pasta menu ' },
      descriptionTranslations: { en: 'Main and drink' },
      groups: [
        { name: 'Hauptgericht', nameTranslations: { en: 'Main course' }, productIds: ['p1', 'p3'] },
        { name: 'Getränk', productIds: ['p2'] },
      ],
    };

    it('are stored trimmed and returned, groups included', async () => {
      const res = await executeCreateCombo({ shopId: 'shop-1', body: tBody, now }, http);
      expect(createProduct).toHaveBeenCalledWith(
        expect.objectContaining({ nameTranslations: { en: 'Pasta menu' }, descriptionTranslations: { en: 'Main and drink' } }),
      );
      expect(res.ok && res.data).toMatchObject({
        nameTranslations: { en: 'Pasta menu' },
        descriptionTranslations: { en: 'Main and drink' },
        images: [],
        groups: [
          { name: 'Hauptgericht', nameTranslations: { en: 'Main course' } },
          { name: 'Getränk', nameTranslations: {} },
        ],
      });
    });

    it.each([
      ['unknown language', { nameTranslations: { xx: 'a' } }, 'Unsupported language: xx'],
      ['non-string value', { nameTranslations: { en: 5 } }, 'Translation for en must be a string'],
      ['not an object', { descriptionTranslations: 'x' }, 'translations must be an object keyed by language code'],
      ['name too long', { nameTranslations: { en: 'a'.repeat(121) } }, 'Translation for en must be at most 120 characters'],
      [
        'group name too long',
        { groups: [{ name: 'A', nameTranslations: { en: 'a'.repeat(61) }, productIds: ['p1'] }] },
        'Translation for en must be at most 60 characters',
      ],
    ])('reject %s', async (_n, extra, error) => {
      const res = await executeCreateCombo({ shopId: 'shop-1', body: { ...body, ...extra }, now }, http);
      expect(res).toEqual({ ok: false, code: 'INVALID_INPUT', error });
      expect(createProduct).not.toHaveBeenCalled();
    });

    it('left out on update keep what is stored (as a dish update does); sent ones replace', async () => {
      const stored = {
        ...P_COMBO,
        nameTranslations: { en: 'Old' },
        descriptionTranslations: { en: 'Old d' },
        images: [{ id: 'i1', url: 'u', createdAt: 'x' }],
        combo: {
          ...P_COMBO.combo!,
          groups: [
            { id: 'g-main', name: 'Hauptgericht', nameTranslations: { en: 'Main' }, productIds: ['p1'] },
            { id: 'g-drink', name: 'Getränk', productIds: ['p2'] },
          ],
        },
      };
      (findProductById as any).mockResolvedValue(stored);
      const groups = [
        { id: 'g-main', name: 'Hauptgericht', productIds: ['p1'] },
        { id: 'g-drink', name: 'Getränk', nameTranslations: { en: 'Drink' }, productIds: ['p2'] },
      ];
      await executeUpdateCombo({ shopId: 'shop-1', comboId: 'p9', body: { ...body, groups }, now }, http);
      let saved = (updateProduct as any).mock.calls[0][0];
      expect(saved.nameTranslations).toEqual({ en: 'Old' });
      expect(saved.descriptionTranslations).toEqual({ en: 'Old d' });
      expect(saved.images).toEqual(stored.images);
      expect(saved.combo.groups[0].nameTranslations).toEqual({ en: 'Main' });
      expect(saved.combo.groups[1].nameTranslations).toEqual({ en: 'Drink' });

      await executeUpdateCombo(
        { shopId: 'shop-1', comboId: 'p9', body: { ...body, groups, nameTranslations: {} }, now },
        http,
      );
      saved = (updateProduct as any).mock.calls[1][0];
      expect(saved.nameTranslations).toEqual({});
      expect(logAudit).toHaveBeenLastCalledWith(
        expect.objectContaining({ changes: expect.arrayContaining([{ field: 'nameTranslations', from: '[updated]', to: '[updated]' }]) }),
      );
    });
  });
});
