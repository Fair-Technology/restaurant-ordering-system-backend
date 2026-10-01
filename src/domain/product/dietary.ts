import { LocalizedLabel } from '../reference/ReferenceLists';

export type DietaryTagId = 'vegetarian' | 'vegan' | 'halal' | 'gluten_free' | 'lactose_free';

export type SpiceLevel = 'mild' | 'medium' | 'hot';

export const DIETARY_TAGS: ReadonlyArray<{ id: DietaryTagId; labels: LocalizedLabel }> = [
  { id: 'vegetarian', labels: { de: 'Vegetarisch', en: 'Vegetarian' } },
  { id: 'vegan', labels: { de: 'Vegan', en: 'Vegan' } },
  { id: 'halal', labels: { de: 'Halal', en: 'Halal' } },
  { id: 'gluten_free', labels: { de: 'Glutenfrei', en: 'Gluten-free' } },
  { id: 'lactose_free', labels: { de: 'Laktosefrei', en: 'Lactose-free' } },
];

export const SPICE_LEVELS: ReadonlyArray<{ id: SpiceLevel; labels: LocalizedLabel }> = [
  { id: 'mild', labels: { de: 'Leicht scharf', en: 'Mildly spicy' } },
  { id: 'medium', labels: { de: 'Scharf', en: 'Spicy' } },
  { id: 'hot', labels: { de: 'Sehr scharf', en: 'Very spicy' } },
];

const VEGAN_CONFLICT_ALLERGENS = ['milk', 'eggs', 'fish', 'crustaceans', 'molluscs'] as const;

export function dietaryConflict(tagIds: readonly string[], allergenIds: readonly string[]): string | null {
  if (tagIds.includes('gluten_free') && allergenIds.includes('gluten')) {
    return 'A dish tagged gluten-free cannot contain the gluten allergen';
  }
  if (tagIds.includes('vegan')) {
    for (const id of VEGAN_CONFLICT_ALLERGENS) {
      if (allergenIds.includes(id)) {
        return `A dish tagged vegan cannot contain the ${id} allergen`;
      }
    }
  }
  return null;
}
