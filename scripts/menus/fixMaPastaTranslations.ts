import * as fs from 'fs';
import * as path from 'path';

// One-off (2026-11-24): Ma Pasta (dev-DB slug `ma-pasta`; the seed file says `mapasta`) was seeded German-only, so every string falls back to German
// under EN, and a stray dev edit renamed the Pomodoro dish to "Pomodoro English" (leaking into every language).
// Step 1 reverts that name; step 2 adds the missing `en` translations, matched by name.
// Dry run by default; pass --apply to write. Safe to run twice: items whose `en` already matches are skipped.
//   npx ts-node --transpile-only scripts/menus/fixMaPastaTranslations.ts [--apply]

const settingsPath = path.join(__dirname, '..', '..', 'local.settings.json');
if (fs.existsSync(settingsPath)) {
  const raw = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  for (const [k, v] of Object.entries(raw.Values ?? {})) if (process.env[k] === undefined) process.env[k] = v as string;
}

/* eslint-disable @typescript-eslint/no-var-requires */
const { findShopBySlug } = require('../../src/infrastructure/cosmos/shop/CosmosShopRepository');
const { findCategoriesByShopId, updateCategory } = require('../../src/infrastructure/cosmos/category/CosmosCategoryRepository');
const { findProductsByShopId, updateProduct } = require('../../src/infrastructure/cosmos/product/CosmosProductRepository');
/* eslint-enable @typescript-eslint/no-var-requires */

const SLUG = 'ma-pasta';

const CATEGORIES: Record<string, string> = {
  Pasta: 'Pasta',
  Lasagne: 'Lasagne',
  Salat: 'Salad',
  Getränke: 'Drinks',
  Dessert: 'Dessert',
};

const GROUPS: Record<string, string> = {
  'Ihre Pasta': 'Your Pasta',
  Teigsorte: 'Dough Type',
  'Ihre Extras': 'Your Extras',
  'Deine Extras': 'Your Extras',
  Dressing: 'Dressing',
};

const OPTIONS: Record<string, string> = {
  Spaghetti: 'Spaghetti',
  Fusilli: 'Fusilli',
  Rigatoni: 'Rigatoni',
  Tagliatelle: 'Tagliatelle',
  Gnocchi: 'Gnocchi',
  'Farbige Pasta': 'Coloured Pasta',
  'Dinkel-Pasta': 'Spelt Pasta',
  'Grana Padano (gerieben)': 'Grana Padano (grated)',
  'Grana Padano (gehobelt)': 'Grana Padano (shaved)',
  Pinienkerne: 'Pine Nuts',
  Mozzarella: 'Mozzarella',
  Thunfisch: 'Tuna',
  Hähnchenbrustfilet: 'Chicken Breast Fillet',
  'Panini / Pizzabrot': 'Panini / Pizza Bread',
  Ziegenfrischkäse: 'Fresh Goat Cheese',
  Scampi: 'Shrimp (Scampi)',
  Rinderstreifen: 'Beef Strips',
  Lachsfilet: 'Salmon Fillet',
  Chorizo: 'Chorizo',
  Balsamico: 'Balsamic',
  Mango: 'Mango',
};

// seeded name → [en name, en description]
const DISHES: Record<string, [string, string]> = {
  Pomodoro: ['Pomodoro', 'Tomato sauce and Grana Padano'],
  Peperoncino: ['Peperoncino', 'Chilli peppers, cherry tomatoes, garlic and fresh herbs tossed in olive oil'],
  Salvia: ['Salvia', 'Fresh sage and Grana Padano tossed in butter and white wine'],
  Ricotta: ['Ricotta', 'Fresh basil and spinach pesto, roasted almonds, ricotta cheese, cherry tomatoes, rocket'],
  'Pesto Verde': ['Pesto Verde', 'Basil pesto, olive oil, roasted pine nuts, rocket, Grana Padano'],
  'Pesto Rosso': ['Pesto Rosso', 'Sun-dried tomato pesto, olives, feta cheese, roasted almonds, rocket, Grana Padano'],
  Verdure: ['Verdure', 'Broccoli, mushrooms, cherry tomatoes and courgette tossed in garlic olive oil'],
  Pancetta: ['Pancetta', 'Spicy tomato sauce, bacon, chilli peppers, olives'],
  Carbonara: ['Carbonara', 'Bacon and egg yolk in cream sauce, Grana Padano'],
  Bolognese: ['Bolognese', 'Minced beef in tomato sauce, Grana Padano'],
  Funghi: ['Funghi', 'Mushrooms, garlic and herbs in cream sauce with Grana Padano'],
  Ortolana: ['Ortolana', 'Gorgonzola cheese and fresh spinach in herb cream sauce'],
  'Di Capra': ['Di Capra', 'Fresh goat cheese, cream, dried tomatoes, thyme, chopped walnuts and spiced forest honey'],
  Tartufata: ['Tartufata', 'Black truffle pesto, cherry tomatoes, pine nuts, rocket, Grana Padano'],
  'Mango Chili Pesto': ['Mango Chili Pesto', 'Fresh goat cheese, mango, chilli, roasted almonds, rocket, Grana Padano'],
  Fitness: ['Fitness', 'Chicken strips, cherry tomatoes, mushrooms, broccoli, Grana Padano'],
  Chorizo: ['Chorizo', 'Chorizo (Spanish sausage), olives, chilli, cherry tomatoes fried in garlic and herbs, Grana Padano'],
  Gamberetti: ['Gamberetti', 'Shrimp, courgette, cherry tomatoes, fresh herbs tossed in white wine'],
  Salmone: ['Salmone', 'Salmon fillet, fresh spinach and herbs in white wine cream sauce'],
  Manzo: ['Manzo', 'Beef strips, dried tomatoes, herbs in garlic olive oil, rocket, pine nuts, Grana Padano'],
  Mare: ['Mare', 'Shrimp, squid, mussels, garlic tomato sauce, cherry tomatoes and herbs tossed in white wine'],
  'Lasagne Rossa': ['Lasagne Rossa', 'Filled with cheese in tomato cream sauce, baked with mozzarella'],
  'Lasagne Classica': ['Lasagne Classica', 'Filled with minced beef and cheese in tomato cream sauce, baked with cheese'],
  'Lasagne Caprese': ['Lasagne Caprese', 'Filled with mozzarella, cherry tomatoes and basil in pesto cream sauce, baked with mozzarella'],
  'Lasagne Spinaci': ['Lasagne Spinaci', 'Filled with fresh spinach, ricotta cheese, cherry tomatoes and herbs in spinach pesto cream sauce, baked with mozzarella'],
  'Lasagne Capra': ['Lasagne Capra', 'Filled with fresh goat cheese, dried tomato and walnut pesto in thyme cream sauce, forest honey, baked with cheese'],
  'Lasagne Tartufata': ['Lasagne Tartufata', 'Filled with cheese, cherry tomatoes and fresh mushrooms in black truffle pesto cream sauce, baked with Grana Padano'],
  'Lasagne Salmone': ['Lasagne Salmone', 'Filled with salmon, fresh spinach and cheese in herb cream sauce, baked with cheese'],
  'Basis Salat': ['Basic Salad', 'Colourful mixed seasonal salad with rocket, cherry tomatoes, cucumber, carrots, onions and corn'],
  'Rucola Salat': ['Rocket Salad', 'Rocket with mozzarella, olives, cherry tomatoes, basil pesto and pine nuts'],
  'Hausgemachte Limonade Zitrone-Minze': ['Homemade Lemon-Mint Lemonade', 'Freshly squeezed lemon, mint, soda'],
  'Hausgemachte Limonade Mango-Maracuja': ['Homemade Mango-Passionfruit Lemonade', 'Mango, passionfruit, soda'],
  'Coca-Cola': ['Coca-Cola', '0.3l'],
  Fanta: ['Fanta', '0.3l'],
  Sprite: ['Sprite', '0.3l'],
  'Mineralwasser still': ['Still Mineral Water', '0.5l'],
  'Mineralwasser spritzig': ['Sparkling Mineral Water', '0.5l'],
  'Pils vom Fass': ['Draft Pilsner', '0.3l'],
  'Alkoholfreies Bier': ['Non-Alcoholic Beer', '0.33l, bottle'],
  'Hauswein Rot': ['House Red Wine', '0.2l'],
  'Hauswein Weiß': ['House White Wine', '0.2l'],
  Espresso: ['Espresso', ''],
  Cappuccino: ['Cappuccino', ''],
  Tiramisu: ['Tiramisu', 'Ladyfingers, mascarpone, espresso, cocoa'],
  'Panna Cotta': ['Panna Cotta', 'Vanilla cream dessert with berry sauce'],
};

/** Returns the item's translation map with `en` set, or null when nothing needs to change. */
function withEn(existing: Record<string, string> | undefined, en: string | undefined): Record<string, string> | null {
  if (!en) return null; // no entry, or empty description: skip
  if (existing?.en === en) return null;
  return { ...(existing ?? {}), en };
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const host = new URL(process.env.COSMOS_DB_ENDPOINT ?? process.env.COSMOS_ENDPOINT ?? 'https://localhost').hostname;
  console.log(`${apply ? 'APPLYING to' : 'Dry run against'} ${host}\n`);

  const shop = await findShopBySlug(SLUG);
  if (!shop) {
    console.error(`Shop with slug "${SLUG}" not found`);
    process.exit(1);
  }
  console.log(`Shop: ${shop.name} (${shop.id})\n`);

  const [categories, products] = await Promise.all([findCategoriesByShopId(shop.id), findProductsByShopId(shop.id)]);
  const now = new Date().toISOString();
  const n = { categories: 0, products: 0, groups: 0, options: 0, renamed: 0 };

  for (const c of categories) {
    if (c.isDeleted) continue;
    const tr = withEn(c.nameTranslations, CATEGORIES[c.name]);
    if (!tr) continue;
    n.categories++;
    console.log(`category  ${c.name} → en "${tr.en}"`);
    if (apply) await updateCategory({ ...c, nameTranslations: tr, updatedAt: now });
  }

  const translateGroup = (g: any, optionsOnly = false): any => {
    let changed = false;
    const out = { ...g };
    if (!optionsOnly) {
      const tr = withEn(g.nameTranslations, GROUPS[g.name]);
      if (tr) {
        out.nameTranslations = tr;
        n.groups++;
        changed = true;
      }
    }
    out.options = (g.options ?? []).map((o: any) => {
      const tr = withEn(o.nameTranslations, OPTIONS[o.name]);
      if (!tr) return o;
      n.options++;
      changed = true;
      return { ...o, nameTranslations: tr };
    });
    return changed ? out : g;
  };

  for (const p of products) {
    if (p.isDeleted) continue;
    let next = { ...p };
    let changed = false;

    if (p.name === 'Pomodoro English') {
      next.name = 'Pomodoro';
      n.renamed++;
      changed = true;
      console.log(`product   "Pomodoro English" → name reverted to "Pomodoro"`);
    }

    const dish = DISHES[next.name];
    if (dish) {
      const nameTr = withEn(p.nameTranslations, dish[0]);
      const descTr = withEn(p.descriptionTranslations, dish[1]);
      if (nameTr) next.nameTranslations = nameTr;
      if (descTr) next.descriptionTranslations = descTr;
      if (nameTr || descTr) {
        changed = true;
        n.products++;
        console.log(`product   ${next.name} → en "${dish[0]}"${descTr ? ` / "${dish[1]}"` : ''}`);
      }
    }

    for (const key of ['variantGroups', 'addonGroups'] as const) {
      if (!p[key]) continue;
      const groups = p[key].map((g: any) => translateGroup(g));
      if (groups.some((g: any, i: number) => g !== p[key][i])) {
        next[key] = groups;
        changed = true;
      }
    }

    if (changed && apply) await updateProduct({ ...next, updatedAt: now });
  }

  const pomodoro = products.filter((p: any) => !p.isDeleted && /^Pomodoro/.test(p.name));
  for (const p of pomodoro) {
    const name = p.name === 'Pomodoro English' ? 'Pomodoro' : p.name;
    console.log(`\nPomodoro product name ${apply ? 'is now' : 'will be'}: ${JSON.stringify(name)}`);
  }

  console.log(
    `\n${n.renamed} name revert(s), ${n.categories} categor(ies), ${n.products} product(s), ${n.groups} group(s), ${n.options} option(s) ${apply ? 'updated' : 'would be updated'}.`,
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
