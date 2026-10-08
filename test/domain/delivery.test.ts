import { describe, expect, it } from 'vitest';
import {
  chargesTotalCents,
  cleanDeliveryAddress,
  deliveryFeeCharge,
  describeDeliveryZones,
  findDeliveryZone,
  hoursForMode,
  isValidPostcode,
  normalisePostcode,
  parseDeliveryZones,
} from '../../src/domain/order/delivery';
import { chargedCents, deliveryFeeCentsOf } from '../../src/domain/order/Order';
import { buildTaxBreakdownWithCharges } from '../../src/domain/order/tax';
import { DE_REFERENCE_LISTS } from '../../src/domain/reference/ReferenceLists';
import {
  ACCEPTED_TWO_LINE_ORDER,
  CARD_SHOP,
  DELIVERY_SHOP,
  DELIVERY_ZONE,
  FEE_CHARGE,
  LUNCH_HOURS,
  NOW_OPEN,
  PLACED_CARD_ORDER,
} from '../fixtures/orders';

describe('delivery rules', () => {
  it('normalises postcodes', () => {
    expect(normalisePostcode(' 10 115 ')).toBe('10115');
    expect(normalisePostcode('sw1a 1aa')).toBe('SW1A1AA');
    expect(normalisePostcode('  ')).toBeNull();
    expect(normalisePostcode(10115)).toBeNull();
  });

  it('checks postcodes per country', () => {
    expect(isValidPostcode('01067', 'DE')).toBe(true);
    expect(isValidPostcode('1011', 'DE')).toBe(false);
    expect(isValidPostcode('101150', 'DE')).toBe(false);
    expect(isValidPostcode('A-1010', 'AT')).toBe(true);
    expect(isValidPostcode('AB', 'AT')).toBe(false);
  });

  it('reads delivery zones', () => {
    expect(parseDeliveryZones([{ postcode: ' 10115 ', feeCents: 250, minOrderCents: 1500 }], 'DE')).toEqual([
      { postcode: '10115', feeCents: 250, minOrderCents: 1500 },
    ]);
    expect(parseDeliveryZones([], 'DE')).toEqual([]);
    expect(parseDeliveryZones([{ postcode: '01067', feeCents: 0, minOrderCents: 0 }], 'DE')).toEqual([
      { postcode: '01067', feeCents: 0, minOrderCents: 0 },
    ]);
    const bad: unknown[] = [
      [{ postcode: '1011', feeCents: 0, minOrderCents: 0 }],
      [
        { postcode: '10115', feeCents: 0, minOrderCents: 0 },
        { postcode: '10 115', feeCents: 0, minOrderCents: 0 },
      ],
      [{ postcode: '10115', feeCents: 10001, minOrderCents: 0 }],
      [{ postcode: '10115', feeCents: 2.5, minOrderCents: 0 }],
      [{ postcode: '10115', feeCents: 0, minOrderCents: -1 }],
      [{ postcode: '10115', feeCents: 0, minOrderCents: 100001 }],
      'x',
      [null],
      Array.from({ length: 201 }, (_, i) => ({ postcode: String(10000 + i), feeCents: 0, minOrderCents: 0 })),
    ];
    for (const b of bad) expect(parseDeliveryZones(b, 'DE')).toBe('invalid');
  });

  it('finds the zone for a postcode', () => {
    expect(findDeliveryZone(DELIVERY_SHOP, '10 115')).toEqual(DELIVERY_ZONE);
    expect(findDeliveryZone(DELIVERY_SHOP, '10999')).toBeNull();
    expect(findDeliveryZone(DELIVERY_SHOP, undefined)).toBeNull();
    expect(findDeliveryZone(CARD_SHOP, '10115')).toBeNull();
  });

  it("uses delivery's own hours when set", () => {
    const EVENING = { mon: [{ open: '17:00', close: '22:00' }], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
    const shop = { ...CARD_SHOP, orderSettings: { deliveryHours: EVENING } };
    expect(hoursForMode(shop, 'delivery')).toEqual(EVENING);
    expect(hoursForMode(shop, 'collection')).toEqual(LUNCH_HOURS);
    expect(hoursForMode(DELIVERY_SHOP, 'delivery')).toEqual(LUNCH_HOURS);
  });

  it('the fee carries the rate of the class the restaurant picked', () => {
    expect(deliveryFeeCharge(DELIVERY_SHOP, DELIVERY_ZONE, DE_REFERENCE_LISTS, NOW_OPEN)).toEqual({
      kind: 'delivery_fee',
      grossCents: 250,
      taxClassId: 'food',
      taxRateBasisPoints: 700,
      taxCents: 16,
    });
    expect(
      deliveryFeeCharge({ ...CARD_SHOP, orderSettings: { deliveryFeeTaxClassId: 'beverage' } }, DELIVERY_ZONE, DE_REFERENCE_LISTS, NOW_OPEN),
    ).toEqual({ kind: 'delivery_fee', grossCents: 250, taxClassId: 'beverage', taxRateBasisPoints: 1900, taxCents: 40 });
    expect(deliveryFeeCharge(DELIVERY_SHOP, { ...DELIVERY_ZONE, feeCents: 0 }, DE_REFERENCE_LISTS, NOW_OPEN)).toBeNull();
  });

  it('the breakdown includes the fee at its rate', () => {
    expect(buildTaxBreakdownWithCharges(PLACED_CARD_ORDER.items, [FEE_CHARGE])).toEqual([
      { rateBasisPoints: 700, grossCents: 1300, taxCents: 85 },
    ]);
    expect(
      buildTaxBreakdownWithCharges(ACCEPTED_TWO_LINE_ORDER.items, [
        { kind: 'delivery_fee', grossCents: 250, taxClassId: 'beverage', taxRateBasisPoints: 1900, taxCents: 40 },
      ]),
    ).toEqual([
      { rateBasisPoints: 700, grossCents: 1050, taxCents: 69 },
      { rateBasisPoints: 1900, grossCents: 950, taxCents: 152 },
    ]);
    expect(buildTaxBreakdownWithCharges(PLACED_CARD_ORDER.items, [])).toEqual([{ rateBasisPoints: 700, grossCents: 1050, taxCents: 69 }]);
  });

  it('what an order charges', () => {
    expect(chargedCents({ subtotalCents: 1050 })).toBe(1050);
    expect(chargedCents({ subtotalCents: 1050, totalCents: 1300 })).toBe(1300);
    expect(deliveryFeeCentsOf({ fulfilmentMode: 'collection' })).toBeNull();
    expect(deliveryFeeCentsOf({ fulfilmentMode: 'delivery' })).toBe(0);
    expect(deliveryFeeCentsOf({ fulfilmentMode: 'delivery', charges: [FEE_CHARGE] })).toBe(250);
    expect(chargesTotalCents(undefined)).toBe(0);
  });

  it('cleans a delivery address', () => {
    expect(cleanDeliveryAddress({ street: ' Teststraße 1 ', postcode: '10 115', city: ' Berlin ' })).toEqual({
      street: 'Teststraße 1',
      postcode: '10115',
      city: 'Berlin',
    });
    const ok = { street: 'Teststraße 1', postcode: '10115', city: 'Berlin' };
    const bad: unknown[] = [
      { street: ok.street, postcode: ok.postcode },
      { ...ok, street: '' },
      { ...ok, street: 'x'.repeat(201) },
      { ...ok, postcode: '12345678901' },
      'x',
      null,
    ];
    for (const b of bad) expect(cleanDeliveryAddress(b)).toBeNull();
  });

  it('describes zones for the activity log', () => {
    expect(describeDeliveryZones([])).toBe('none');
    expect(describeDeliveryZones([DELIVERY_ZONE, { postcode: '10117', feeCents: 350, minOrderCents: 2000 }])).toBe('10115, 10117');
  });
});
