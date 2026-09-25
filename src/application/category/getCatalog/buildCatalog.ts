import { Category } from '../../../domain/category/Category';
import { menuLanguagesOf, localize, resolveMenuLanguage, TranslationMap } from '../../../domain/menu/menuLanguage';
import { isOnMenu, Product, ProductOption, ProductSchedule } from '../../../domain/product/Product';
import { DIETARY_TAGS, SPICE_LEVELS, SpiceLevel } from '../../../domain/product/dietary';
import { MenuLanguage, ReferenceListsDoc } from '../../../domain/reference/ReferenceLists';
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
  });

  const categoryDtos: CatalogCategoryDto[] = categories
    .filter((c) => !c.isDeleted)
    .map((c) => ({
      id: c.id,
      name: L(c.name, c.nameTranslations),
      sortOrder: c.sortOrder,
      icon: c.icon ?? undefined,
      products: visible
        .filter((p) => p.categoryIds.includes(c.id))
        .map((p): CatalogProductDto => ({
          id: p.id,
          name: L(p.name, p.nameTranslations),
          description: L(p.description, p.descriptionTranslations),
          price: p.price,
          offerPrice: p.schedule?.offerPrice ?? null,
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
          allergens: allergenLabel(p.allergenIds),
          additives: additiveLabel(p.additiveIds),
          dietaryTags: tagLabel(p.dietaryTagIds),
          spice: spice(p.spiceLevel),
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        })),
    }));

  return { language, languages, categories: categoryDtos };
}
