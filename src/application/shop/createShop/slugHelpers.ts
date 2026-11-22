/** Owner-visible web address rule: ASCII lowercase letters, digits and hyphens; 1-64 chars; starts with a letter/digit. */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

const SLUG_FORMAT_MESSAGE = 'Please choose a web address using letters, numbers and hyphens';
export const SLUG_EMPTY_MESSAGE = 'Could not generate a web address from this name; please choose one';

/**
 * Returns an error message if the slug is not a valid web address, or null if it is valid.
 */
export function validateSlugFormat(slug: string): string | null {
  if (typeof slug !== 'string' || slug === '' || !SLUG_RE.test(slug)) {
    return SLUG_FORMAT_MESSAGE;
  }
  return null;
}

/**
 * Generate a URL-friendly slug from a shop name
 * Example: "Burger King Belconnen" -> "burger-king-belconnen"
 * German umlauts and ß are transliterated (ä→ae), other Latin diacritics are stripped (é→e).
 * A name with no Latin letters or digits (e.g. "寿司屋") yields '' — the caller decides what that means.
 */
export function generateSlugFromName(name: string): string {
  return (
    name
      .trim()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .replace(/Ä/g, 'Ae')
      .replace(/Ö/g, 'Oe')
      .replace(/Ü/g, 'Ue')
      // Strip remaining diacritics (é → e, ñ → n, ç → c)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      // Replace runs of anything outside [a-z0-9] with a single hyphen
      .replace(/[^a-z0-9]+/g, '-')
      // Remove leading/trailing hyphens
      .replace(/^-+|-+$/g, '')
      // A name can be longer than a slug may be (80 vs 64): cut, then drop a hyphen left dangling
      .slice(0, 64)
      .replace(/-+$/, '')
  );
}

/**
 * Validates that a slug generated from the shop name is unique
 * Throws an error if the slug already exists or cannot be generated
 * @param name The shop name to generate slug from
 * @param checkSlugExists Function that returns true if slug already exists
 * @returns The generated slug if unique
 * @throws Error if slug already exists, or the name yields no slug
 */
export async function validateUniqueSlug(
  name: string,
  checkSlugExists: (slug: string) => Promise<boolean>,
): Promise<string> {
  const slug = generateSlugFromName(name);

  if (slug === '') {
    throw new Error(SLUG_EMPTY_MESSAGE);
  }

  const slugExists = await checkSlugExists(slug);
  if (slugExists) {
    throw new Error('A shop with this name already exists');
  }

  return slug;
}
