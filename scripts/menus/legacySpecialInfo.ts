import { DIETARY_TAGS } from '../../src/domain/product/dietary';
import { DE_REFERENCE_LISTS } from '../../src/domain/reference/ReferenceLists';

const ALLERGEN_MAP: Record<string, string> = {
  'Contains Gluten': 'gluten',
  'Contains Dairy': 'milk',
  'Contains Egg': 'eggs',
  'Contains Fish': 'fish',
};

const ADDITIVE_MAP: Record<string, string> = {
  'Contains Caffeine': 'caffeine',
};

const TAG_MAP: Record<string, string> = {
  Vegan: 'vegan',
  Vegetarian: 'vegetarian',
};

export function legacySpecialInfoToMenuFields(
  items: Array<{ name: string }>,
): { allergenIds: string[]; additiveIds: string[]; dietaryTagIds: string[]; spiceLevel: 'medium' | null } {
  const allergenSet = new Set<string>();
  const additiveSet = new Set<string>();
  const tagSet = new Set<string>();
  let spiceLevel: 'medium' | null = null;

  for (const item of items) {
    if (item.name in ALLERGEN_MAP) allergenSet.add(ALLERGEN_MAP[item.name]);
    else if (item.name in ADDITIVE_MAP) additiveSet.add(ADDITIVE_MAP[item.name]);
    else if (item.name in TAG_MAP) tagSet.add(TAG_MAP[item.name]);
    else if (item.name === 'Spicy') spiceLevel = 'medium';
  }

  const allergenIds = DE_REFERENCE_LISTS.allergens.map((a) => a.id).filter((id) => allergenSet.has(id));
  const additiveIds = DE_REFERENCE_LISTS.additives.map((a) => a.id).filter((id) => additiveSet.has(id));
  const dietaryTagIds = DIETARY_TAGS.map((t) => t.id).filter((id) => tagSet.has(id));

  return { allergenIds, additiveIds, dietaryTagIds, spiceLevel };
}
