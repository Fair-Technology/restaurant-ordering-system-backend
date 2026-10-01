import { MenuLanguage, SUPPORTED_MENU_LANGUAGES } from '../reference/ReferenceLists';

export type TranslationMap = Partial<Record<MenuLanguage, string>>;

const ORIGINAL_LANGUAGE_COUNTRIES = ['DE', 'AT', 'CH'];

export function defaultMenuLanguageForCountry(countryCode: string): MenuLanguage {
  return ORIGINAL_LANGUAGE_COUNTRIES.includes(countryCode.toUpperCase()) ? 'de' : 'en';
}

export function menuLanguagesOf(shop: { menuLanguages?: MenuLanguage[]; countryCode?: string }): MenuLanguage[] {
  return shop.menuLanguages?.length ? shop.menuLanguages : [defaultMenuLanguageForCountry(shop.countryCode ?? '')];
}

export function resolveMenuLanguage(requested: string | null | undefined, offered: readonly MenuLanguage[]): MenuLanguage {
  const code = (requested ?? '').slice(0, 2).toLowerCase();
  return (offered as string[]).includes(code) ? (code as MenuLanguage) : offered[0];
}

export function localize(
  original: string,
  translations: TranslationMap | undefined,
  lang: MenuLanguage,
  originalLang: MenuLanguage,
): string {
  if (lang === originalLang) return original;
  return translations?.[lang]?.trim() || original;
}

export function normaliseTranslations(value: unknown, maxLength: number): TranslationMap | string {
  if (value === null || value === undefined) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    return 'translations must be an object keyed by language code';
  }
  const out: TranslationMap = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (!SUPPORTED_MENU_LANGUAGES.includes(k as MenuLanguage)) {
      return `Unsupported language: ${k}`;
    }
    if (typeof v !== 'string') {
      return `Translation for ${k} must be a string`;
    }
    const trimmed = v.trim();
    if (trimmed === '') continue;
    if (trimmed.length > maxLength) {
      return `Translation for ${k} must be at most ${maxLength} characters`;
    }
    out[k as MenuLanguage] = trimmed;
  }
  return out;
}

export function validateMenuLanguagesChange(current: readonly MenuLanguage[], next: unknown): MenuLanguage[] | string {
  if (!Array.isArray(next)) return 'menuLanguages must be an array';
  if (next.length === 0) return 'menuLanguages must contain the original language';
  for (const x of next) {
    if (!SUPPORTED_MENU_LANGUAGES.includes(x)) return `Unsupported language: ${x}`;
  }
  if (next[0] !== current[0]) return `The original menu language (${current[0]}) cannot be changed`;
  return [...new Set(next)] as MenuLanguage[];
}
