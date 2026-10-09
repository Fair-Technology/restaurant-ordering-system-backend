import { describe, expect, it } from 'vitest';
import {
  COMBO_AVAILABLE_ERROR,
  COMBO_BMF_ERROR,
  COMBO_CATEGORY_ERROR,
  COMBO_DESCRIPTION_ERROR,
  COMBO_DISH_ERROR,
  COMBO_GROUPS_ERROR,
  COMBO_NAME_ERROR,
  COMBO_PRICE_ERROR,
  parseComboInput,
  splitComboUnit,
  type ComboContext,
} from '../../src/domain/product/combo';
import { P_COMBO } from '../fixtures/orders';

const P = (weightCents: number, isDrink = false) => ({ weightCents, isDrink });
const ids = () => {
  let n = 0;
  return () => `g${++n}`;
};
const ctx = (over: Partial<ComboContext> = {}): ComboContext => ({
  countryCode: 'DE',
  categoryIds: new Set(['pasta', 'drinks']),
  dishIds: new Set(['p1', 'p2', 'p3']),
  existing: null,
  newId: ids(),
  ...over,
});
const base = { name: 'M', priceCents: 1200, categoryId: 'pasta', groups: [{ name: 'A', productIds: ['p1'] }] };

describe('splitComboUnit', () => {
  it("splits by each dish's own price", () => {
    expect(splitComboUnit(1200, [P(1050), P(350, true)], false)).toEqual([900, 300]);
    expect(splitComboUnit(1600, [P(1450), P(350, true)], false)).toEqual([1289, 311]);
    expect(splitComboUnit(1200, [P(800), P(350, true)], false)).toEqual([835, 365]);
    expect(splitComboUnit(0, [P(1050), P(350, true)], false)).toEqual([0, 0]);
  });
  it('the BMF option puts 30 percent on the drinks', () => {
    expect(splitComboUnit(1200, [P(1050), P(350, true)], true)).toEqual([840, 360]);
    expect(splitComboUnit(1500, [P(1050), P(350, true), P(250, true)], true)).toEqual([1050, 263, 187]);
  });
  it('the BMF option needs a drink and something else', () => {
    expect(splitComboUnit(800, [P(350, true), P(450, true)], true)).toEqual([350, 450]);
    expect(splitComboUnit(1200, [P(1050), P(150)], true)).toEqual([1050, 150]);
  });
  it('free dishes share equally', () => {
    expect(splitComboUnit(500, [P(0), P(0, true)], false)).toEqual([250, 250]);
  });
  it('the parts always add up to the combo', () => {
    for (const u of [1, 7, 999, 1201]) {
      for (const bmf of [false, true]) {
        expect(splitComboUnit(u, [P(1050), P(350, true)], bmf).reduce((s, c) => s + c, 0)).toBe(u);
      }
    }
    expect(splitComboUnit(999, [P(1050), P(350, true)], true)).toEqual([699, 300]);
  });
});

describe('parseComboInput', () => {
  it('parses a new combo', () => {
    expect(
      parseComboInput(
        {
          name: ' Pasta-Menü ',
          priceCents: 1200,
          categoryId: 'pasta',
          groups: [
            { name: 'Hauptgericht', productIds: ['p1', 'p3'] },
            { name: 'Getränk', productIds: ['p2', 'p2'] },
          ],
        },
        ctx(),
      ),
    ).toEqual({
      name: 'Pasta-Menü',
      description: '',
      price: 1200,
      categoryIds: ['pasta'],
      isAvailable: true,
      combo: {
        groups: [
          { id: 'g1', name: 'Hauptgericht', productIds: ['p1', 'p3'] },
          { id: 'g2', name: 'Getränk', productIds: ['p2'] },
        ],
        bmfDrinkShare: false,
      },
    });
  });

  it('keeps the ids of groups it already has', () => {
    const res = parseComboInput(
      {
        ...base,
        groups: [
          { id: 'g-main', name: 'A', productIds: ['p1'] },
          { id: 'g-other', name: 'B', productIds: ['p2'] },
        ],
      },
      ctx({ existing: P_COMBO.combo! }),
    ) as { combo: { groups: { id: string }[] } };
    expect(res.combo.groups.map((g) => g.id)).toEqual(['g-main', 'g1']);
  });

  it('keeps a repeated group id only once', () => {
    const res = parseComboInput(
      { ...base, groups: [{ id: 'g-main', name: 'A', productIds: ['p1'] }, { id: 'g-main', name: 'B', productIds: ['p2'] }] },
      ctx({ existing: P_COMBO.combo! }),
    ) as { combo: { groups: { id: string }[] } };
    expect(res.combo.groups.map((g) => g.id)).toEqual(['g-main', 'g1']);
  });

  it('refuses bad combos', () => {
    const six = Array.from({ length: 6 }, () => ({ name: 'A', productIds: ['p1'] }));
    const cases: Array<[Record<string, unknown>, string, Partial<ComboContext>?]> = [
      [{ name: '  ' }, COMBO_NAME_ERROR],
      [{ name: 'x'.repeat(121) }, COMBO_NAME_ERROR],
      [{ description: 'x'.repeat(2001) }, COMBO_DESCRIPTION_ERROR],
      [{ priceCents: 0 }, COMBO_PRICE_ERROR],
      [{ priceCents: 12.5 }, COMBO_PRICE_ERROR],
      [{ priceCents: 100001 }, COMBO_PRICE_ERROR],
      [{ categoryId: 'gone' }, COMBO_CATEGORY_ERROR],
      [{ groups: [] }, COMBO_GROUPS_ERROR],
      [{ groups: six }, COMBO_GROUPS_ERROR],
      [{ groups: [{ name: '', productIds: ['p1'] }] }, COMBO_GROUPS_ERROR],
      [{ groups: [{ name: 'A', productIds: [] }] }, COMBO_GROUPS_ERROR],
      [{ groups: [{ name: 'A', productIds: ['p9'] }] }, COMBO_DISH_ERROR],
      [{ bmfDrinkShare: 'yes' }, COMBO_BMF_ERROR],
      [{ bmfDrinkShare: true }, COMBO_BMF_ERROR, { countryCode: 'AT' }],
      [{ isAvailable: 'no' }, COMBO_AVAILABLE_ERROR],
    ];
    for (const [change, error, c] of cases) {
      expect(parseComboInput({ ...base, ...change }, ctx(c))).toEqual({ error });
    }
  });

  it('the BMF option is accepted in Germany', () => {
    const res = parseComboInput({ ...base, bmfDrinkShare: true }, ctx()) as { combo: { bmfDrinkShare: boolean } };
    expect(res.combo.bmfDrinkShare).toBe(true);
  });
});
