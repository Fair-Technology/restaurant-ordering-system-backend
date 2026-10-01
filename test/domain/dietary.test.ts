import { describe, it, expect } from 'vitest';
import { dietaryConflict } from '../../src/domain/product/dietary';

describe('dietaryConflict', () => {
  it('flags gluten-free with a gluten allergen', () => {
    expect(dietaryConflict(['gluten_free'], ['gluten'])).toBe(
      'A dish tagged gluten-free cannot contain the gluten allergen',
    );
  });

  it('flags vegan with the first matching allergen', () => {
    expect(dietaryConflict(['vegan'], ['celery', 'milk'])).toBe('A dish tagged vegan cannot contain the milk allergen');
  });

  it('allows compatible tags and allergens', () => {
    expect(dietaryConflict(['vegetarian'], ['milk', 'eggs'])).toBeNull();
  });
});
