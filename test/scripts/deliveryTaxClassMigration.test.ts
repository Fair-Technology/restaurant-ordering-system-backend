import { describe, expect, it } from 'vitest';
import { assertScriptTarget, withDeliveryFeeClassReset, withDeliveryTaxClass } from '../../scripts/deliveryTaxClassMigration';
import { validateReferenceListsUpdate } from '../../src/application/reference/updateReferenceLists/validateReferenceListsUpdate';
import { DE_REFERENCE_LISTS } from '../../src/domain/reference/ReferenceLists';
import { CARD_SHOP } from '../fixtures/orders';

const BEFORE = {
  ...structuredClone(DE_REFERENCE_LISTS),
  taxClasses: DE_REFERENCE_LISTS.taxClasses.filter((c) => c.id !== 'delivery'),
  taxRates: DE_REFERENCE_LISTS.taxRates.filter((r) => r.taxClassId !== 'delivery'),
};
const DEV = 'restaurant-ordering-system-db-dev.documents.azure.com';

describe('delivery tax class migration', () => {
  it('adds the class and three rows', () => {
    const result = withDeliveryTaxClass(BEFORE)!;
    expect(result.taxClasses.map((c) => c.id)).toEqual(['food', 'beverage', 'delivery']);
    const rows = result.taxRates.filter((r) => r.taxClassId === 'delivery');
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.rateBasisPoints === 1900)).toBe(true);
    const pick = { allergens: result.allergens, additives: result.additives, taxClasses: result.taxClasses, defaultTaxClassId: result.defaultTaxClassId, taxRates: result.taxRates };
    expect(typeof validateReferenceListsUpdate(BEFORE, pick, new Date('2026-10-13T10:00:00Z'))).not.toBe('string');
  });

  it('is idempotent', () => {
    expect(withDeliveryTaxClass(DE_REFERENCE_LISTS)).toBeNull();
  });

  it('resets a pinned fee class and leaves the rest', () => {
    const shop = { ...CARD_SHOP, orderSettings: { delivery: true, deliveryFeeTaxClassId: 'food' } };
    expect(withDeliveryFeeClassReset(shop)!.orderSettings).toEqual({ delivery: true, deliveryFeeTaxClassId: null });
    expect(withDeliveryFeeClassReset({ ...shop, orderSettings: { deliveryFeeTaxClassId: 'delivery' } })).toBeNull();
    expect(withDeliveryFeeClassReset({ ...shop, orderSettings: { deliveryFeeTaxClassId: null } })).toBeNull();
    expect(withDeliveryFeeClassReset({ ...shop, orderSettings: undefined })).toBeNull();
  });

  it('refuses a missing or mismatched target', () => {
    const endpoint = `https://${DEV}:443/`;
    expect(() => assertScriptTarget(endpoint, undefined)).toThrow('Refusing to run: pass --target=<database host>');
    expect(() => assertScriptTarget(endpoint, 'other.example.com')).toThrow(`Refusing to run: the database is ${DEV} but --target says other.example.com`);
    expect(assertScriptTarget(endpoint, DEV)).toBe(DEV);
  });
});
