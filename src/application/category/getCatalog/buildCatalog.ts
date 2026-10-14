import { Category, isCategoryLive } from '../../../domain/category/Category';
import { menuLanguagesOf, localize, resolveMenuLanguage, TranslationMap } from '../../../domain/menu/menuLanguage';
import { isOnMenu, Product, ProductOption, ProductSchedule } from '../../../domain/product/Product';
import { DIETARY_TAGS, SPICE_LEVELS, SpiceLevel } from '../../../domain/product/dietary';
import { MenuLanguage, ReferenceListsDoc } from '../../../domain/reference/ReferenceLists';
import { activeBasePriceCents } from '../../order/_shared/priceBasket';
import { Shop } from '../../../domain/shop/Shop';
import {
  CatalogAdditiveDto,
  CatalogCategoryDto,
  CatalogLabelDto,
  CatalogOptionDto,
  CatalogProductDto,
  GetCatalogResultDto,
} from './dtos';

export function isWithinSchedule(
  schedule: ProductSchedule | null | undefined,
  timezone: string,
  now: Date,
): boolean {
  if (!schedule) return true; // no schedule = always available

  // Resolve current date/time in shop timezone
  const localDate = now.toLocaleDateString('en-CA', { timeZone: timezone }); // "YYYY-MM-DD"
  const localTime = now.toLocaleTimeString('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }); // "HH:mm"
  const [y, m, d] = localDate.split('-').map(Number);
  const localDayOfWeek = new Date(y, m - 1, d).getDay(); // 0=Sun … 6=Sat

  if (localDate < schedule.startDate) return false;
  if (schedule.endDate && localDate > schedule.endDate) return false;
  if (schedule.daysOfWeek) {
    if (schedule.daysOfWeek.length === 0) return false;
    if (!schedule.daysOfWeek.includes(localDayOfWeek)) return false;
  }

  const start = schedule.startTime ?? '00:00';
  const end = schedule.endTime ?? '23:59';
  if (localTime < start || localTime > end) return false;

  return true;
}

export function buildCatalog(input: {
  shop: Pick<Shop, 'timezone' | 'countryCode'> & { menuLanguages?: MenuLanguage[] };
  categories: Category[];
  products: Product[];
  refs: ReferenceListsDoc;
  lang: string | undefined;
  now: Date;
}): GetCatalogResultDto {
  const { shop, categories, products, refs, lang, now } = input;

  const languages = menuLanguagesOf(shop);
  const original = languages[0];
  const language = resolveMenuLanguage(lang, languages);
  const L = (o: string, tr?: TranslationMap) => localize(o, tr, language, original);

  const visible = products.filter((p) => isOnMenu(p) && isWithinSchedule(p.schedule ?? null, shop.timezone, now));

  // Every switched-on category goes to the storefront, also those outside their times (marked, so the menu can offer
  // them under "Other times"). Combos only offer dishes listed under a category that is live right now.
  const shownCategories = categories.filter((c) => !c.isDeleted && c.isAvailable !== false);
  const liveCategoryIds = new Set(shownCategories.filter((c) => isCategoryLive(c, shop.timezone, now)).map((c) => c.id));
  const listed = new Map(
    visible.filter((p) => !p.combo && p.categoryIds.some((id) => liveCategoryIds.has(id))).map((p) => [p.id, p]),
  );
  const comboGroups = (p: Product) =>
    (p.combo?.groups ?? []).map((g) => ({
      id: g.id,
      name: L(g.name, g.nameTranslations),
      productIds: g.productIds.filter((id) => listed.has(id)),
    }));
  const offered = visible.filter((p) => !p.combo || comboGroups(p).every((g) => g.productIds.length > 0));
  const unionOf = (p: Product, key: 'allergenIds' | 'additiveIds'): string[] => [
    ...new Set(comboGroups(p).flatMap((g) => g.productIds).flatMap((id) => listed.get(id)?.[key] ?? [])),
  ];

  const allergenLabel = (ids: string[] | null): CatalogLabelDto[] =>
    refs.allergens
      .filter((a) => (ids ?? []).includes(a.id))
      .map((a) => ({ id: a.id, label: a.labels[language] }));

  const additiveLabel = (ids: string[] | null): CatalogAdditiveDto[] =>
    refs.additives
      .filter((a) => (ids ?? []).includes(a.id))
      .map((a) => ({ id: a.id, code: a.code, label: a.labels[language] }));

  const tagLabel = (ids: string[] | undefined): CatalogLabelDto[] =>
    DIETARY_TAGS.filter((t) => (ids ?? []).includes(t.id)).map((t) => ({ id: t.id, label: t.labels[language] }));

  const spice = (s: SpiceLevel | null | undefined): CatalogLabelDto | null => {
    const d = SPICE_LEVELS.find((x) => x.id === s);
    return d ? { id: d.id, label: d.labels[language] } : null;
  };

  const opt = (o: ProductOption): CatalogOptionDto => ({
    id: o.id,
    name: L(o.name, o.nameTranslations),
    priceDelta: o.priceDelta,
    isAvailable: o.isAvailable,
    allergens: allergenLabel(o.allergenIds ?? []),
    additives: additiveLabel(o.additiveIds ?? []),
  });

  const categoryDtos: CatalogCategoryDto[] = shownCategories
    .map((c) => ({
      id: c.id,
      name: L(c.name, c.nameTranslations),
      sortOrder: c.sortOrder,
      icon: c.icon ?? undefined,
      availableNow: liveCategoryIds.has(c.id),
      schedule: c.schedule
        ? { daysOfWeek: [...c.schedule.daysOfWeek], startTime: c.schedule.startTime, endTime: c.schedule.endTime }
        : null,
      products: offered
        .filter((p) => p.categoryIds.includes(c.id))
        .map((p): CatalogProductDto => ({
          id: p.id,
          name: L(p.name, p.nameTranslations),
          description: L(p.description, p.descriptionTranslations),
          price: p.price,
          offerPrice: activeBasePriceCents(p) < p.price ? activeBasePriceCents(p) : null,
          offerLabel: p.schedule?.offerLabel ?? null,
          images: (p.images ?? []).map((img) => ({
            id: img.id,
            url: img.url,
            alt: img.alt,
            sortOrder: img.sortOrder ?? 0,
          })),
          variants: (p.variantGroups ?? []).map((g) => ({
            id: g.id,
            name: L(g.name, g.nameTranslations),
            options: g.options.map(opt),
          })),
          addons: (p.addonGroups ?? []).map((g) => ({
            id: g.id,
            name: L(g.name, g.nameTranslations),
            minSelectable: g.minSelectable,
            maxSelectable: g.maxSelectable,
            options: g.options.map(opt),
          })),
          isAvailable: p.isAvailable,
          allergens: allergenLabel(p.combo ? unionOf(p, 'allergenIds') : p.allergenIds),
          additives: additiveLabel(p.combo ? unionOf(p, 'additiveIds') : p.additiveIds),
          dietaryTags: tagLabel(p.dietaryTagIds),
          spice: spice(p.spiceLevel),
          unavailableModes: p.unavailableModes ?? [],
          availableNow: p.categoryIds.some((id) => liveCategoryIds.has(id)),
          combo: p.combo ? { groups: comboGroups(p) } : null,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        })),
    }));

  return { language, languages, categories: categoryDtos };
}
