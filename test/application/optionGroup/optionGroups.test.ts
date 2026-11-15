import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/application/_shared/shopAccess', () => ({
  authorizeShopAction: vi.fn(),
  toAuditActor: vi.fn(() => ({ actorType: 'user', actorId: 'u-1' })),
}));
vi.mock('../../../src/application/_shared/auditHelpers', () => ({ logAudit: vi.fn(async () => undefined) }));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({ findShopById: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/optionGroup/CosmosShopOptionGroupRepository', () => ({
  findShopOptionGroupById: vi.fn(),
  findShopOptionGroupsByShopId: vi.fn(),
  createShopOptionGroup: vi.fn(async (g: any) => g),
  updateShopOptionGroup: vi.fn(async (g: any) => g),
  deleteShopOptionGroup: vi.fn(),
}));
vi.mock('../../../src/infrastructure/cosmos/reference/CosmosReferenceListsRepository', () => ({
  getReferenceLists: vi.fn(),
}));

import { executeCreateOptionGroup } from '../../../src/application/optionGroup/createOptionGroup/executeCreateOptionGroup';
import { executeGetOptionGroups } from '../../../src/application/optionGroup/getOptionGroups/executeGetOptionGroups';
import { executeGetOptionGroup } from '../../../src/application/optionGroup/getOptionGroup/executeGetOptionGroup';
import { executeUpdateOptionGroup } from '../../../src/application/optionGroup/updateOptionGroup/executeUpdateOptionGroup';
import { executeDeleteOptionGroup } from '../../../src/application/optionGroup/deleteOptionGroup/executeDeleteOptionGroup';
import { executeSetOptionAvailability } from '../../../src/application/optionGroup/setOptionAvailability/executeSetOptionAvailability';
import { authorizeShopAction } from '../../../src/application/_shared/shopAccess';
import { logAudit } from '../../../src/application/_shared/auditHelpers';
import { findShopById } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import {
  createShopOptionGroup,
  findShopOptionGroupById,
  findShopOptionGroupsByShopId,
  updateShopOptionGroup,
} from '../../../src/infrastructure/cosmos/optionGroup/CosmosShopOptionGroupRepository';
import { getReferenceLists } from '../../../src/infrastructure/cosmos/reference/CosmosReferenceListsRepository';
import {
  SHOP_OPTION_GROUP_KIND_ERROR,
  SHOP_OPTION_GROUP_NOT_FOUND_ERROR,
  SHOP_OPTION_GROUP_OPTION_NOT_FOUND_ERROR,
  SHOP_OPTION_GROUP_OPTIONS_ERROR,
  SHOP_OPTION_GROUP_SELECTION_ERROR,
} from '../../../src/domain/optionGroup/ShopOptionGroup';

const httpRequest = {} as any;
const DENIED = { ok: false, code: 'FORBIDDEN', error: 'Insufficient permissions' } as const;

let stored: any;

function drinksGroup() {
  return {
    id: 'g-1',
    shopId: 'shop-1',
    kind: 'variant',
    name: 'Choose a drink',
    nameTranslations: {},
    minSelectable: 1,
    maxSelectable: 1,
    options: [
      { id: 'o-coke', name: 'Coke', priceDelta: 0, isAvailable: true, allergenIds: [], additiveIds: ['caffeine'] },
      { id: 'o-fanta', name: 'Fanta', priceDelta: 50, isAvailable: true, allergenIds: [], additiveIds: [] },
    ],
    isDeleted: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  stored = drinksGroup();
  vi.mocked(findShopById).mockResolvedValue({ id: 'shop-1', countryCode: 'DE', isDeleted: false } as any);
  vi.mocked(authorizeShopAction).mockResolvedValue({ ok: true, actor: { kind: 'user' }, permissions: ['manage_menu'] } as any);
  vi.mocked(getReferenceLists).mockResolvedValue({
    allergens: [{ id: 'gluten' }, { id: 'milk' }],
    additives: [{ id: 'caffeine' }],
    taxClasses: [],
  } as any);
  vi.mocked(findShopOptionGroupById).mockImplementation(async () => stored);
  vi.mocked(findShopOptionGroupsByShopId).mockImplementation(async () => [stored]);
});

const createBody = (over: Record<string, unknown> = {}) => ({
  shopId: 'shop-1',
  kind: 'variant' as const,
  name: '  Choose a drink ',
  options: [{ name: 'Coke', priceDelta: 0 }, { name: 'Fanta', priceDelta: 50, allergenIds: ['milk'] }],
  ...over,
});

describe('createOptionGroup', () => {
  it('rejects a bad kind', async () => {
    const r = await executeCreateOptionGroup(createBody({ kind: 'combo' }) as any, httpRequest);
    expect(r).toEqual({ ok: false, code: 'INVALID_INPUT', error: SHOP_OPTION_GROUP_KIND_ERROR });
    expect(createShopOptionGroup).not.toHaveBeenCalled();
  });

  it('rejects empty options', async () => {
    const r = await executeCreateOptionGroup(createBody({ options: [] }) as any, httpRequest);
    expect(r).toEqual({ ok: false, code: 'INVALID_INPUT', error: SHOP_OPTION_GROUP_OPTIONS_ERROR });
    expect(createShopOptionGroup).not.toHaveBeenCalled();
  });

  it('rejects an unknown allergen', async () => {
    const r = await executeCreateOptionGroup(
      createBody({ options: [{ name: 'Coke', priceDelta: 0, allergenIds: ['peanut'] }] }) as any,
      httpRequest,
    );
    expect(r).toEqual({ ok: false, code: 'INVALID_INPUT', error: 'Unknown allergen: peanut' });
    expect(createShopOptionGroup).not.toHaveBeenCalled();
  });

  it('assigns ids, defaults availability and forces variant groups to 1/1', async () => {
    const r = await executeCreateOptionGroup(createBody({ minSelectable: 0, maxSelectable: 2 }) as any, httpRequest);
    expect(r.ok).toBe(true);
    const saved = vi.mocked(createShopOptionGroup).mock.calls[0][0];
    expect(saved.id).toMatch(/[0-9a-f-]{36}/);
    expect(saved).toMatchObject({ shopId: 'shop-1', kind: 'variant', name: 'Choose a drink', minSelectable: 1, maxSelectable: 1, isDeleted: false });
    expect(saved.options).toHaveLength(2);
    for (const o of saved.options) {
      expect(o.id).toMatch(/[0-9a-f-]{36}/);
      expect(o.isAvailable).toBe(true);
      expect(o.additiveIds).toEqual([]);
    }
    expect(saved.options[1].allergenIds).toEqual(['milk']);
    expect(saved.options[0].id).not.toBe(saved.options[1].id);
    expect(saved.createdAt).toBe(saved.updatedAt);
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'optionGroup.create', entityType: 'optionGroup', entityId: saved.id }));
  });

  it('defaults an addon group to 0..options.length and validates a sent pair', async () => {
    const ok = await executeCreateOptionGroup(createBody({ kind: 'addon' }) as any, httpRequest);
    expect(ok.ok && ok.data).toMatchObject({ kind: 'addon', minSelectable: 0, maxSelectable: 2 });

    const bad = await executeCreateOptionGroup(createBody({ kind: 'addon', minSelectable: 2, maxSelectable: 1 }) as any, httpRequest);
    expect(bad).toEqual({ ok: false, code: 'INVALID_INPUT', error: SHOP_OPTION_GROUP_SELECTION_ERROR });
  });

  it('keeps a client-sent option id', async () => {
    await executeCreateOptionGroup(createBody({ options: [{ id: 'mine', name: 'Coke', priceDelta: 0 }] }) as any, httpRequest);
    expect(vi.mocked(createShopOptionGroup).mock.calls[0][0].options[0].id).toBe('mine');
  });

  it('returns the denial when authorizeShopAction refuses', async () => {
    vi.mocked(authorizeShopAction).mockResolvedValue(DENIED as any);
    const r = await executeCreateOptionGroup(createBody() as any, httpRequest);
    expect(r).toEqual(DENIED);
    expect(createShopOptionGroup).not.toHaveBeenCalled();
  });

  it('404s an unknown shop', async () => {
    vi.mocked(findShopById).mockResolvedValue(null);
    const r = await executeCreateOptionGroup(createBody() as any, httpRequest);
    expect(r).toEqual({ ok: false, code: 'NOT_FOUND', error: 'Shop not found' });
    expect(authorizeShopAction).not.toHaveBeenCalled();
  });

  it('404s a deleted shop', async () => {
    vi.mocked(findShopById).mockResolvedValue({ id: 'shop-1', isDeleted: true } as any);
    const r = await executeCreateOptionGroup(createBody() as any, httpRequest);
    expect(r).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });
});

describe('getOptionGroups / getOptionGroup', () => {
  it('lists the shop groups as DTOs', async () => {
    const r = await executeGetOptionGroups({ shopId: 'shop-1' }, httpRequest);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toHaveLength(1);
    expect(r.data[0]).not.toHaveProperty('isDeleted');
    expect(r.data[0]).toMatchObject({ id: 'g-1', name: 'Choose a drink' });
  });

  it('returns the denial for the list', async () => {
    vi.mocked(authorizeShopAction).mockResolvedValue(DENIED as any);
    expect(await executeGetOptionGroups({ shopId: 'shop-1' }, httpRequest)).toEqual(DENIED);
    expect(findShopOptionGroupsByShopId).not.toHaveBeenCalled();
  });

  it('gets one and 404s a deleted group', async () => {
    const r = await executeGetOptionGroup({ shopId: 'shop-1', groupId: 'g-1' }, httpRequest);
    expect(r.ok && r.data.id).toBe('g-1');

    stored = { ...stored, isDeleted: true };
    const gone = await executeGetOptionGroup({ shopId: 'shop-1', groupId: 'g-1' }, httpRequest);
    expect(gone).toEqual({ ok: false, code: 'NOT_FOUND', error: SHOP_OPTION_GROUP_NOT_FOUND_ERROR });
  });

  it('404s an unknown shop', async () => {
    vi.mocked(findShopById).mockResolvedValue(null);
    expect(await executeGetOptionGroup({ shopId: 'x', groupId: 'g-1' }, httpRequest)).toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('updateOptionGroup', () => {
  it('replaces options, preserves existing ids, mints new ones and drops omitted ones', async () => {
    stored.options[0].isAvailable = false;
    const r = await executeUpdateOptionGroup(
      {
        shopId: 'shop-1',
        groupId: 'g-1',
        kind: 'addon',
        name: 'Drinks',
        options: [
          { id: 'o-coke', name: 'Coca-Cola', priceDelta: 10 },
          { name: 'Sprite', priceDelta: 0 },
        ],
      } as any,
      httpRequest,
    );
    expect(r.ok).toBe(true);
    const saved = vi.mocked(updateShopOptionGroup).mock.calls[0][0];
    expect(saved.kind).toBe('variant'); // immutable
    expect(saved.name).toBe('Drinks');
    expect(saved.minSelectable).toBe(1);
    expect(saved.maxSelectable).toBe(1);
    expect(saved.options.map((o) => o.name)).toEqual(['Coca-Cola', 'Sprite']);
    expect(saved.options[0]).toMatchObject({ id: 'o-coke', priceDelta: 10, isAvailable: false, additiveIds: ['caffeine'] });
    expect(saved.options[1].id).not.toBe('o-fanta');
    expect(saved.options[1].id).toMatch(/[0-9a-f-]{36}/);
    expect(saved.options[1].isAvailable).toBe(true);
    expect(saved.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(saved.updatedAt).not.toBe('2026-01-01T00:00:00.000Z');
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'optionGroup.update' }));
  });

  it('re-validates like create', async () => {
    const r = await executeUpdateOptionGroup(
      { shopId: 'shop-1', groupId: 'g-1', name: 'Drinks', options: [{ name: 'Coke', priceDelta: 1.5 }] } as any,
      httpRequest,
    );
    expect(r).toEqual({ ok: false, code: 'INVALID_INPUT', error: SHOP_OPTION_GROUP_OPTIONS_ERROR });
    expect(updateShopOptionGroup).not.toHaveBeenCalled();
  });

  it('404s an unknown group', async () => {
    stored = null;
    const r = await executeUpdateOptionGroup(
      { shopId: 'shop-1', groupId: 'nope', name: 'Drinks', options: [{ name: 'Coke', priceDelta: 0 }] } as any,
      httpRequest,
    );
    expect(r).toEqual({ ok: false, code: 'NOT_FOUND', error: SHOP_OPTION_GROUP_NOT_FOUND_ERROR });
  });
});

describe('deleteOptionGroup', () => {
  it('soft-deletes', async () => {
    const r = await executeDeleteOptionGroup({ shopId: 'shop-1', groupId: 'g-1' }, httpRequest);
    expect(r.ok && r.data.isDeleted).toBe(true);
    const saved = vi.mocked(updateShopOptionGroup).mock.calls[0][0];
    expect(saved).toMatchObject({ id: 'g-1', isDeleted: true, options: stored.options });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'optionGroup.delete', entityId: 'g-1' }));
  });

  it('returns the denial and does not delete', async () => {
    vi.mocked(authorizeShopAction).mockResolvedValue(DENIED as any);
    expect(await executeDeleteOptionGroup({ shopId: 'shop-1', groupId: 'g-1' }, httpRequest)).toEqual(DENIED);
    expect(updateShopOptionGroup).not.toHaveBeenCalled();
  });
});

describe('setOptionAvailability', () => {
  const req = (over: Record<string, unknown> = {}) =>
    ({ shopId: 'shop-1', groupId: 'g-1', optionId: 'o-coke', isAvailable: false, ...over }) as any;

  it('flips exactly one option', async () => {
    const r = await executeSetOptionAvailability(req(), httpRequest);
    expect(r.ok).toBe(true);
    const saved = vi.mocked(updateShopOptionGroup).mock.calls[0][0];
    expect(saved.options.map((o) => [o.id, o.isAvailable])).toEqual([
      ['o-coke', false],
      ['o-fanta', true],
    ]);
    expect(saved.options[0]).toMatchObject({ name: 'Coke', additiveIds: ['caffeine'] });
  });

  it('rejects a non-boolean isAvailable', async () => {
    const r = await executeSetOptionAvailability(req({ isAvailable: 'no' }), httpRequest);
    expect(r).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(findShopById).not.toHaveBeenCalled();
  });

  it('404s an unknown option', async () => {
    const r = await executeSetOptionAvailability(req({ optionId: 'o-sprite' }), httpRequest);
    expect(r).toEqual({ ok: false, code: 'NOT_FOUND', error: SHOP_OPTION_GROUP_OPTION_NOT_FOUND_ERROR });
    expect(updateShopOptionGroup).not.toHaveBeenCalled();
  });

  it('404s an unknown group', async () => {
    stored = null;
    const r = await executeSetOptionAvailability(req(), httpRequest);
    expect(r).toEqual({ ok: false, code: 'NOT_FOUND', error: SHOP_OPTION_GROUP_NOT_FOUND_ERROR });
  });

  it('404s an unknown shop', async () => {
    vi.mocked(findShopById).mockResolvedValue(null);
    expect(await executeSetOptionAvailability(req(), httpRequest)).toEqual({ ok: false, code: 'NOT_FOUND', error: 'Shop not found' });
  });

  it('returns the denial', async () => {
    vi.mocked(authorizeShopAction).mockResolvedValue(DENIED as any);
    expect(await executeSetOptionAvailability(req(), httpRequest)).toEqual(DENIED);
    expect(updateShopOptionGroup).not.toHaveBeenCalled();
  });
});
