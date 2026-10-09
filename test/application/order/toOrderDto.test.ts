import { describe, expect, it } from 'vitest';
import { toOrderDto } from '../../../src/application/order/_shared/toOrderDto';
import { ACCEPTED_CARD_ORDER, COMBO_ORDER, NOW_OPEN } from '../../fixtures/orders';

describe('toOrderDto combos', () => {
  it('tells the restaurant which lines are one combo', () => {
    const dto = toOrderDto(COMBO_ORDER, NOW_OPEN);
    expect(dto.items.map((i) => i.combo)).toEqual([
      { line: 0, productId: 'p9', name: 'Pasta-Menü' },
      { line: 0, productId: 'p9', name: 'Pasta-Menü' },
    ]);
  });

  it('a dish line has no combo', () => {
    expect(toOrderDto(ACCEPTED_CARD_ORDER, NOW_OPEN).items[0].combo).toBeNull();
  });
});
