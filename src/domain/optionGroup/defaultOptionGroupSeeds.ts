import { MenuLanguage, SUPPORTED_MENU_LANGUAGES } from '../reference/ReferenceLists';
import { ShopOptionGroupKind } from './ShopOptionGroup';

/**
 * Option groups every new shop starts with (SPECS §6 "Shop-level option-group
 * library"). All prices are a neutral 0-cent delta: the owner has not set real
 * prices yet. Edit the strings here; nothing else holds them.
 */
interface SeedOptionText {
  en: string;
  de: string;
  priceDelta: number;
}
interface SeedGroupText {
  en: string;
  de: string;
  kind: ShopOptionGroupKind;
  options: SeedOptionText[];
}

const DEFAULT_OPTION_GROUP_SEEDS: SeedGroupText[] = [
  {
    en: 'Size',
    de: 'Größe',
    kind: 'variant',
    options: [
      { en: 'Small', de: 'Klein', priceDelta: 0 },
      { en: 'Medium', de: 'Mittel', priceDelta: 0 },
      { en: 'Large', de: 'Groß', priceDelta: 0 },
    ],
  },
  {
    en: 'Extras',
    de: 'Extras',
    kind: 'addon',
    options: [
      { en: 'Extra cheese', de: 'Extra Käse', priceDelta: 0 },
      { en: 'Extra sauce', de: 'Extra Soße', priceDelta: 0 },
      { en: 'Extra portion', de: 'Extra Portion', priceDelta: 0 },
    ],
  },
];

type Translations = Partial<Record<MenuLanguage, string>>;

export interface DefaultOptionGroupSeed {
  kind: ShopOptionGroupKind;
  name: string;
  nameTranslations: Translations;
  minSelectable: number;
  maxSelectable: number;
  options: { name: string; nameTranslations: Translations; priceDelta: number }[];
}

function texts(entry: { en: string; de: string }, originalLanguage: MenuLanguage) {
  const nameTranslations: Translations = {};
  for (const lang of SUPPORTED_MENU_LANGUAGES) {
    if (lang !== originalLanguage) nameTranslations[lang] = entry[lang as 'en' | 'de'];
  }
  return { name: entry[originalLanguage as 'en' | 'de'], nameTranslations };
}

export function buildDefaultOptionGroupSeeds(originalLanguage: MenuLanguage): DefaultOptionGroupSeed[] {
  return DEFAULT_OPTION_GROUP_SEEDS.map((group) => ({
    kind: group.kind,
    ...texts(group, originalLanguage),
    minSelectable: group.kind === 'variant' ? 1 : 0,
    maxSelectable: group.kind === 'variant' ? 1 : group.options.length,
    options: group.options.map((o) => ({ ...texts(o, originalLanguage), priceDelta: o.priceDelta })),
  }));
}
