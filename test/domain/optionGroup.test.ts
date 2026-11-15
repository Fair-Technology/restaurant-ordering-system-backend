import { describe, it, expect } from 'vitest';
import {
  isShopOptionGroupKind,
  MAX_OPTION_GROUP_OPTIONS,
  SHOP_OPTION_GROUP_DUPLICATE_OPTION_ID_ERROR,
  SHOP_OPTION_GROUP_MAX_SELECTABLE_ERROR,
  SHOP_OPTION_GROUP_NAME_ERROR,
  SHOP_OPTION_GROUP_OPTIONS_ERROR,
  SHOP_OPTION_GROUP_SELECTION_ERROR,
  validateShopOptionGroupFields,
} from '../../src/domain/optionGroup/ShopOptionGroup';

const known = { allergens: new Set(['gluten']), additives: new Set(['caffeine']) };
let n = 0;
const newId = () => `new-${++n}`;
const opt = (over: Record<string, unknown> = {}) => ({ name: 'Coke', priceDelta: 0, ...over });

describe('validateShopOptionGroupFields', () => {
  it('knows the two kinds', () => {
    expect(isShopOptionGroupKind('variant')).toBe(true);
    expect(isShopOptionGroupKind('addon')).toBe(true);
    expect(isShopOptionGroupKind('combo')).toBe(false);
  });

  it('enforces the name length', () => {
    for (const name of ['', '   ', 'x'.repeat(61), 42]) {
      expect(validateShopOptionGroupFields({ name, options: [opt()] }, 'addon', known, [], newId)).toEqual({ error: SHOP_OPTION_GROUP_NAME_ERROR });
    }
    expect('error' in validateShopOptionGroupFields({ name: 'x'.repeat(60), options: [opt()] }, 'addon', known, [], newId)).toBe(false);
  });

  it('enforces option count, option name and priceDelta', () => {
    const bad = [
      [],
      Array.from({ length: MAX_OPTION_GROUP_OPTIONS + 1 }, () => opt()),
      [opt({ name: '' })],
      [opt({ priceDelta: -1 })],
      [opt({ priceDelta: 100001 })],
      [opt({ priceDelta: 0.5 })],
      [opt({ priceDelta: '0' })],
      ['Coke'],
    ];
    for (const options of bad) {
      expect(validateShopOptionGroupFields({ name: 'G', options }, 'addon', known, [], newId)).toEqual({ error: SHOP_OPTION_GROUP_OPTIONS_ERROR });
    }
    const fifty = Array.from({ length: MAX_OPTION_GROUP_OPTIONS }, () => opt({ priceDelta: 100000 }));
    expect('error' in validateShopOptionGroupFields({ name: 'G', options: fifty }, 'addon', known, [], newId)).toBe(false);
  });

  it('validates the addon selection pair', () => {
    const run = (minSelectable: unknown, maxSelectable: unknown) =>
      validateShopOptionGroupFields({ name: 'G', minSelectable, maxSelectable, options: [opt(), opt()] }, 'addon', known, [], newId);
    expect(run(-1, 1)).toEqual({ error: SHOP_OPTION_GROUP_SELECTION_ERROR });
    expect(run(1.5, 2)).toEqual({ error: SHOP_OPTION_GROUP_SELECTION_ERROR });
    expect(run(2, 1)).toEqual({ error: SHOP_OPTION_GROUP_SELECTION_ERROR });
    expect(run(0, 3)).toEqual({ error: SHOP_OPTION_GROUP_MAX_SELECTABLE_ERROR });
    expect(run(1, 2)).toMatchObject({ minSelectable: 1, maxSelectable: 2 });
  });

  it('rejects duplicate option ids and unknown additives', () => {
    expect(
      validateShopOptionGroupFields({ name: 'G', options: [opt({ id: 'a' }), opt({ id: 'a' })] }, 'addon', known, [], newId),
    ).toEqual({ error: SHOP_OPTION_GROUP_DUPLICATE_OPTION_ID_ERROR });
    expect(
      validateShopOptionGroupFields({ name: 'G', options: [opt({ additiveIds: ['msg'] })] }, 'addon', known, [], newId),
    ).toEqual({ error: 'Unknown additive: msg' });
  });
});
