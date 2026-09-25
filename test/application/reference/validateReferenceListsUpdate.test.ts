import { describe, it, expect } from 'vitest';
import { DE_REFERENCE_LISTS, defaultReferenceLists, ReferenceListsDoc } from '../../../src/domain/reference/ReferenceLists';
import { validateReferenceListsUpdate } from '../../../src/application/reference/updateReferenceLists/validateReferenceListsUpdate';

const baseline = DE_REFERENCE_LISTS;
const now = new Date('2026-09-25T10:00:00Z');

function nextFromBaseline(doc: ReferenceListsDoc) {
  return structuredClone({
    allergens: doc.allergens,
    additives: doc.additives,
    taxClasses: doc.taxClasses,
    defaultTaxClassId: doc.defaultTaxClassId,
    taxRates: doc.taxRates,
  });
}

describe('validateReferenceListsUpdate', () => {
  it('accepts unchanged lists', () => {
    const next = nextFromBaseline(baseline);
    expect(validateReferenceListsUpdate(baseline, next, now)).toEqual(next);
  });

  it('refuses to remove an allergen', () => {
    const next = nextFromBaseline(baseline);
    next.allergens = next.allergens.filter((a) => a.id !== 'lupin');
    expect(validateReferenceListsUpdate(baseline, next, now)).toBe(
      'Allergen entry lupin cannot be removed — mark it inactive instead',
    );
  });

  it('refuses to edit an existing rate row', () => {
    const next = nextFromBaseline(baseline);
    next.taxRates[0].rateBasisPoints = 800;
    const result = validateReferenceListsUpdate(baseline, next, now);
    expect(result).toBe('Existing rate rows cannot be edited or removed — add a new row with a later effective date');
  });

  it('requires a new rate for an existing class to start in the future', () => {
    const next = nextFromBaseline(baseline);
    next.taxRates.push({
      taxClassId: 'food',
      fulfilmentMode: 'dine_in',
      rateBasisPoints: 1900,
      effectiveFrom: '2026-09-01T00:00:00+02:00',
    });
    const result = validateReferenceListsUpdate(baseline, next, now);
    expect(result).toBe('A new rate for an existing tax class must start in the future');
  });

  it('accepts a future rate row', () => {
    const next = nextFromBaseline(baseline);
    next.taxRates.push({
      taxClassId: 'food',
      fulfilmentMode: 'dine_in',
      rateBasisPoints: 1900,
      effectiveFrom: '2027-01-01T00:00:00+01:00',
    });
    const result = validateReferenceListsUpdate(baseline, next, now);
    expect(typeof result).not.toBe('string');
    if (typeof result === 'string') return;
    expect(result.taxRates).toHaveLength(7);
  });

  it('allows a new class to start with current rates', () => {
    const next = nextFromBaseline(baseline);
    next.taxClasses.push({ id: 'test_class', labels: { de: 'Test', en: 'Test' }, isActive: true });
    next.taxRates.push({
      taxClassId: 'test_class',
      fulfilmentMode: 'collection',
      rateBasisPoints: 1000,
      effectiveFrom: '2026-01-01T00:00:00+01:00',
    });
    const result = validateReferenceListsUpdate(baseline, next, now);
    expect(typeof result).not.toBe('string');
  });

  it('rejects duplicate ids', () => {
    const next = nextFromBaseline(baseline);
    next.allergens.push({ ...next.allergens[0] });
    expect(validateReferenceListsUpdate(baseline, next, now)).toBe('Duplicate id: gluten');
  });

  it('requires defaultTaxClassId to be active', () => {
    const next = nextFromBaseline(baseline);
    next.defaultTaxClassId = 'wine';
    expect(validateReferenceListsUpdate(baseline, next, now)).toBe('defaultTaxClassId must be an active tax class');
  });

  it('accepts the first save for an empty country', () => {
    const emptyBaseline = defaultReferenceLists('AT');
    const next = {
      allergens: [] as ReferenceListsDoc['allergens'],
      additives: [] as ReferenceListsDoc['additives'],
      taxClasses: [{ id: 'food', labels: { de: 'Speisen', en: 'Food' }, isActive: true }],
      defaultTaxClassId: 'food',
      taxRates: [
        { taxClassId: 'food', fulfilmentMode: 'dine_in' as const, rateBasisPoints: 700, effectiveFrom: '2020-01-01T00:00:00+01:00' },
      ],
    };
    const result = validateReferenceListsUpdate(emptyBaseline, next, now);
    expect(typeof result).not.toBe('string');
  });
});
