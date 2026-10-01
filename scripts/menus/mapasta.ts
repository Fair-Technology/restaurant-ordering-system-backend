import { DE_REFERENCE_LISTS } from '../../src/domain/reference/ReferenceLists';

export interface SeedOption {
  name: string;
  priceDelta: number;
}

export interface SeedGroup {
  kind: 'variant' | 'addon';
  name: string;
  minSelectable: number;
  maxSelectable: number;
  options: SeedOption[];
}

export interface SeedDish {
  name: string;
  description: string;
  price: number;
  // Footnote numbers exactly as printed on the 2025 card (empty for the
  // dummy drinks/dessert items, which aren't on the card at all).
  printedCodes: number[];
  // Corrections/additions beyond what the card marks — dishes whose
  // ingredients obviously carry an allergen or additive the card missed,
  // and the full declaration for the dummy items. See the per-dish comments
  // below for what's card-sourced versus inferred.
  inferredAllergenIds: string[];
  inferredAdditiveIds: string[];
  groups: SeedGroup[];
}

export interface SeedCategory {
  name: string;
  taxClassId: 'food' | 'beverage';
  dishes: SeedDish[];
}

export const MA_PASTA_SOURCE =
  'https://www.mapasta.de/wp-content/uploads/2025/08/Ma_Pasta_Karte_aussen_430x1000mm_2025_Entwurf.jpg';

export const MA_PASTA_SHOP = {
  name: 'Ma Pasta' as const,
  slug: 'mapasta' as const,
  address: {
    street: 'Gartenstraße 31',
    city: 'Frankfurt am Main',
    state: 'Hessen',
    postcode: '60596',
    country: 'Deutschland',
  },
  openingHours: {
    mon: [{ open: '11:30', close: '21:00' }],
    tue: [{ open: '11:30', close: '21:00' }],
    wed: [{ open: '11:30', close: '21:00' }],
    thu: [{ open: '11:30', close: '21:00' }],
    fri: [{ open: '11:30', close: '21:00' }],
    sat: [{ open: '11:30', close: '21:00' }],
    sun: [{ open: '12:00', close: '20:00' }],
  },
};

// Printed footnote codes on the 2025 card → platform allergen/additive ids.
// Code 4 (Schwefeldioxid) carries both an allergen and an additive mark.
const ALLERGEN_CODE_MAP: Record<number, string> = {
  4: 'sulphites',
  6: 'milk',
  8: 'tree_nuts',
  9: 'fish',
  10: 'crustaceans',
  11: 'gluten',
  12: 'milk',
};

const ADDITIVE_CODE_MAP: Record<number, string> = {
  1: 'colouring',
  2: 'preservative',
  3: 'flavour_enhancer',
  4: 'sulphured',
  5: 'blackened',
  7: 'preservative',
};

export function mapPrintedCodes(codes: readonly number[]): { allergenIds: string[]; additiveIds: string[] } {
  const allergenSet = new Set<string>();
  const additiveSet = new Set<string>();

  for (const code of codes) {
    if (code in ALLERGEN_CODE_MAP) allergenSet.add(ALLERGEN_CODE_MAP[code]);
    if (code in ADDITIVE_CODE_MAP) additiveSet.add(ADDITIVE_CODE_MAP[code]);
  }

  const allergenIds = DE_REFERENCE_LISTS.allergens.map((a) => a.id).filter((id) => allergenSet.has(id));
  const additiveIds = DE_REFERENCE_LISTS.additives.map((a) => a.id).filter((id) => additiveSet.has(id));

  return { allergenIds, additiveIds };
}

// Merges the card's own printed-code marks with the corrections/additions
// noted per dish (e.g. wheat pasta always carries gluten, Carbonara's egg
// yolk, a dummy drink's caffeine), deduped and ordered by the platform list.
export function resolveDishAllergensAndAdditives(dish: SeedDish): { allergenIds: string[]; additiveIds: string[] } {
  const fromCard = mapPrintedCodes(dish.printedCodes);
  const allergenSet = new Set([...fromCard.allergenIds, ...dish.inferredAllergenIds]);
  const additiveSet = new Set([...fromCard.additiveIds, ...dish.inferredAdditiveIds]);

  const allergenIds = DE_REFERENCE_LISTS.allergens.map((a) => a.id).filter((id) => allergenSet.has(id));
  const additiveIds = DE_REFERENCE_LISTS.additives.map((a) => a.id).filter((id) => additiveSet.has(id));

  return { allergenIds, additiveIds };
}

const PASTA: SeedGroup = {
  kind: 'variant',
  name: 'Deine Pasta',
  minSelectable: 1,
  maxSelectable: 1,
  options: [
    { name: 'Spaghetti', priceDelta: 0 },
    { name: 'Fusilli', priceDelta: 0 },
    { name: 'Rigatoni', priceDelta: 0 },
    { name: 'Tagliatelle', priceDelta: 0 },
    { name: 'Gnocchi', priceDelta: 100 },
  ],
};

const TEIG: SeedGroup = {
  kind: 'addon',
  name: 'Teigsorte',
  minSelectable: 0,
  maxSelectable: 1,
  options: [
    { name: 'Farbige Pasta', priceDelta: 100 },
    { name: 'Dinkel-Pasta', priceDelta: 100 },
  ],
};

const EXTRAS: SeedGroup = {
  kind: 'addon',
  name: 'Deine Extras',
  minSelectable: 0,
  maxSelectable: 12,
  options: [
    { name: 'Grana Padano (gerieben)', priceDelta: 100 },
    { name: 'Grana Padano (gehobelt)', priceDelta: 150 },
    { name: 'Pinienkerne', priceDelta: 150 },
    { name: 'Mozzarella', priceDelta: 250 },
    { name: 'Thunfisch', priceDelta: 250 },
    { name: 'Hähnchenbrustfilet', priceDelta: 350 },
    { name: 'Panini / Pizzabrot', priceDelta: 350 },
    { name: 'Ziegenfrischkäse', priceDelta: 390 },
    { name: 'Scampi', priceDelta: 390 },
    { name: 'Rinderstreifen', priceDelta: 390 },
    { name: 'Lachsfilet', priceDelta: 390 },
    { name: 'Chorizo', priceDelta: 390 },
  ],
};

const DRESSING: SeedGroup = {
  kind: 'addon',
  name: 'Dressing',
  minSelectable: 1,
  maxSelectable: 1,
  options: [
    { name: 'Balsamico', priceDelta: 0 },
    { name: 'Mango', priceDelta: 0 },
  ],
};

function pastaDish(
  name: string,
  description: string,
  price: number,
  printedCodes: number[],
  inferredAllergenIds: string[] = [],
): SeedDish {
  // Every pasta base is wheat (the spelt/coloured pasta addon and the
  // gnocchi variant don't remove it), so gluten always applies even when
  // the card leaves it off.
  const allergens = inferredAllergenIds.includes('gluten') ? inferredAllergenIds : ['gluten', ...inferredAllergenIds];
  return {
    name,
    description,
    price,
    printedCodes,
    inferredAllergenIds: allergens,
    inferredAdditiveIds: [],
    groups: [PASTA, TEIG, EXTRAS],
  };
}

function lasagneDish(
  name: string,
  description: string,
  price: number,
  printedCodes: number[],
  inferredAllergenIds: string[] = [],
): SeedDish {
  // Lasagne sheets are wheat pasta too.
  const allergens = inferredAllergenIds.includes('gluten') ? inferredAllergenIds : ['gluten', ...inferredAllergenIds];
  return {
    name,
    description,
    price,
    printedCodes,
    inferredAllergenIds: allergens,
    inferredAdditiveIds: [],
    groups: [],
  };
}

function saladDish(
  name: string,
  description: string,
  price: number,
  printedCodes: number[],
  inferredAllergenIds: string[] = [],
): SeedDish {
  return {
    name,
    description,
    price,
    printedCodes,
    inferredAllergenIds,
    inferredAdditiveIds: [],
    groups: [DRESSING, EXTRAS],
  };
}

// Not on the card at all — a dummy item to fill out a category the printed
// menu doesn't cover (drinks, dessert). `price` is a guessed Berlin-level
// price, never Ma Pasta's own; `allergenIds`/`additiveIds` are the full
// declaration since there's no printed code to merge with.
function dummyDish(
  name: string,
  description: string,
  price: number, // DUMMY price — not from Ma Pasta
  allergenIds: string[],
  additiveIds: string[],
): SeedDish {
  return {
    name,
    description,
    price,
    printedCodes: [],
    inferredAllergenIds: allergenIds,
    inferredAdditiveIds: additiveIds,
    groups: [],
  };
}

export const MA_PASTA_MENU: SeedCategory[] = [
  {
    name: 'Pasta',
    taxClassId: 'food',
    dishes: [
      // card: milk (6). + gluten (wheat pasta, inferred).
      pastaDish('Pomodoro', 'Tomatensauce und Grana Padano', 1050, [6]),
      // card: none. + gluten (wheat pasta, inferred).
      pastaDish(
        'Peperoncino',
        'Chili-Peperoni, Kirschtomaten, Knoblauch und frische Kräuter in Olivenöl geschwenkt',
        1150,
        [],
      ),
      // card: milk (6). + gluten (wheat pasta, inferred).
      pastaDish('Salvia', 'Frischer Salbei und Grana Padano in Butter und Weißwein geschwenkt', 1150, [6]),
      // card: milk, tree_nuts, milk (6,8,12). + gluten (wheat pasta, inferred).
      pastaDish(
        'Ricotta',
        'Pesto aus frischem Basilikum und Spinat, geröstete Mandeln, Ricotta-Käse, Kirschtomaten, Rucola',
        1250,
        [6, 8, 12],
      ),
      // card: tree_nuts (8). + gluten (wheat pasta) and milk (Grana Padano) — both inferred, card missed the cheese.
      pastaDish('Pesto Verde', 'Basilikumpesto, Olivenöl, geröstete Pinienkerne, Rucola, Grana Padano', 1250, [8], [
        'milk',
      ]),
      // card: tree_nuts, milk (8,12). + gluten (wheat pasta, inferred).
      pastaDish(
        'Pesto Rosso',
        'Pesto getr. Tomaten, Oliven, Hirtenkäse, geröstete Mandeln, Rucola, Grana Padano',
        1250,
        [8, 12],
      ),
      // card: none. + gluten (wheat pasta, inferred).
      pastaDish(
        'Verdure',
        'Broccoli, Champignons, Kirschtomaten und Zucchini in Knoblauch-Olivenöl geschwenkt',
        1350,
        [],
      ),
      // card: colouring, preservative, preservative (1,2,7). + gluten (wheat pasta, inferred).
      pastaDish('Pancetta', 'Scharfe Tomatensauce, Speck, Chilischoten, Oliven', 1290, [1, 2, 7]),
      // card: none — the card has no mark at all here. + gluten (wheat pasta), eggs (Eigelb) and milk
      // (Sahnesauce, Grana Padano) — all inferred; this is the dish flagged in NEEDS-YOU as missing egg.
      pastaDish('Carbonara', 'Speck und Eigelb in Sahnesauce, Grana Padano', 1390, [], ['eggs', 'milk']),
      // card: none. + gluten (wheat pasta) and milk (Grana Padano) — both inferred, card missed the cheese.
      pastaDish('Bolognese', 'Rinderhackfleisch in Tomatensauce, Grana Padano', 1390, [], ['milk']),
      // card: colouring, preservative, milk, preservative (1,2,6,7). + gluten (wheat pasta, inferred).
      pastaDish('Funghi', 'Champignons, Knoblauch und Kräuter in Sahnesauce mit Grana Padano', 1390, [1, 2, 6, 7]),
      // card: milk, tree_nuts (6,8). + gluten (wheat pasta, inferred).
      pastaDish('Ortolana', 'Gorgonzola-Käse und frischer Spinat in Kräuter-Sahnesauce', 1390, [6, 8]),
      // card: milk, tree_nuts (6,8) — already covers the cheese/cream and the walnuts. + gluten (wheat pasta, inferred).
      pastaDish(
        'Di Capra',
        'Ziegenfrischkäse, Sahne, getrocknete Tomaten, Thymian, gehackte Walnüsse und würziger Waldhonig',
        1450,
        [6, 8],
      ),
      // card: blackened, milk (5,6). + gluten (wheat pasta) and tree_nuts (Pinienkerne) — both inferred.
      pastaDish(
        'Tartufata',
        'Schwarze Trüffelpesto, Kirschtomaten, Pinienkerne, Rucola, Grana Padano',
        1450,
        [5, 6],
        ['tree_nuts'],
      ),
      // card: none. + gluten (wheat pasta), milk (Ziegenfrischkäse, Grana Padano) and tree_nuts (Mandeln) — all inferred.
      pastaDish(
        'Mango Chili Pesto',
        'Ziegenfrischkäse, Mango, Chili, geröstete Mandeln, Rucola, Grana Padano',
        1390,
        [],
        ['milk', 'tree_nuts'],
      ),
      // card: milk, gluten (6,11) — already complete. No inference needed.
      pastaDish('Fitness', 'Hähnchenstreifen, Kirschtomaten, Champignons, Broccoli, Grana Padano', 1550, [6, 11]),
      // card: colouring, preservative, flavour_enhancer (1,2,3). + gluten (wheat pasta) and milk (Grana Padano) — both inferred.
      pastaDish(
        'Chorizo',
        'Chorizo (span. Wurst), Oliven, Chili, Kirschtomaten in Knoblauch und Kräutern gebraten, Grana Padano',
        1550,
        [1, 2, 3],
        ['milk'],
      ),
      // card: sulphites, crustaceans (4,10) — already covers the scampi. + gluten (wheat pasta, inferred).
      pastaDish('Gamberetti', 'Scampi, Zucchini, Kirschtomaten, frische Kräuter in Weißwein geschwenkt', 1690, [4, 10]),
      // card: milk, fish (6,9) — already covers the salmon and cream. + gluten (wheat pasta, inferred).
      pastaDish('Salmone', 'Lachsfilet, frischer Spinat und Kräuter in Weißwein-Sahnesauce', 1690, [6, 9]),
      // card: milk (6). + gluten (wheat pasta) and tree_nuts (Pinienkerne) — both inferred.
      pastaDish(
        'Manzo',
        'Rinderstreifen, getrocknete Tomaten, Kräuter in Knoblauch-Olivenöl, Rucola, Pinienkerne, Grana Padano',
        1650,
        [6],
        ['tree_nuts'],
      ),
      // card: fish, crustaceans (9,10) — the card also has no mollusc mark despite Tintenfisch/Miesmuscheln.
      // + gluten (wheat pasta) and molluscs (squid, mussels) — both inferred; the mollusc gap is the one
      // flagged in NEEDS-YOU.
      pastaDish(
        'Mare',
        'Scampi, Tintenfisch, Miesmuscheln, Tomatensauce Knoblauch, Kirschtomaten und Kräuter in Weißwein geschwenkt',
        1650,
        [9, 10],
        ['molluscs'],
      ),
    ],
  },
  {
    name: 'Lasagne',
    taxClassId: 'food',
    dishes: [
      // card: milk (12) — the card misses gluten on lasagne sheets entirely. + gluten (wheat pasta, inferred).
      lasagneDish('Lasagne Rossa', 'Gefüllt mit Käse in Tomaten-Sahne-Sauce und mit Mozzarella überbacken', 1190, [12]),
      // card: milk, gluten (6,11) — already complete. No inference needed.
      lasagneDish(
        'Lasagne Classica',
        'Gefüllt mit Rinderhackfleisch und Käse in Tomaten-Sahne-Sauce und mit Käse überbacken',
        1390,
        [6, 11],
      ),
      // card: milk, gluten, milk (6,11,12) — already complete.
      lasagneDish(
        'Lasagne Caprese',
        'Gefüllt mit Mozzarella, Cherrytomaten und Basilikum in Pesto-Sahne-Sauce und mit Mozzarella überbacken',
        1390,
        [6, 11, 12],
      ),
      // card: milk, gluten, milk (6,11,12) — already complete.
      lasagneDish(
        'Lasagne Spinaci',
        'Gefüllt mit frischem Spinat, Ricottakäse, Cherrytomaten und Kräutern in Spinat-Pesto-Sahne-Sauce und mit Mozzarella überbacken',
        1490,
        [6, 11, 12],
      ),
      // card: milk, gluten (6,11). + tree_nuts (Walnüsse) — inferred, card missed the walnuts.
      lasagneDish(
        'Lasagne Capra',
        'Gefüllt mit Ziegenfrischkäse, Pesto aus getrockneten Tomaten und Walnüssen in Thymian-Sahne-Sauce, Waldhonig und mit Käse überbacken',
        1590,
        [6, 11],
        ['tree_nuts'],
      ),
      // card: blackened, milk, gluten (5,6,11) — already complete.
      lasagneDish(
        'Lasagne Tartufata',
        'Gefüllt mit Käse, Cherrytomaten und frischen Champignons in Sahnesauce aus schwarzem Trüffelpesto und mit Grana Padano überbacken',
        1590,
        [5, 6, 11],
      ),
      // card: milk, fish, gluten (6,9,11) — already complete.
      lasagneDish(
        'Lasagne Salmone',
        'Gefüllt mit Lachs, frischem Spinat und Käse in Kräuter-Sahne-Sauce und mit Käse überbacken',
        1590,
        [6, 9, 11],
      ),
    ],
  },
  {
    name: 'Salat',
    taxClassId: 'food',
    dishes: [
      // card: none. No dairy, gluten or nuts in the base salad; per-dish declaration ignores the optional extras.
      saladDish(
        'Basis Salat',
        'Bunt gemischter Salat der Saison mit Rucola, Kirschtomaten, Gurken, Karotten, Zwiebeln und Mais',
        890,
        [],
      ),
      // card: none. + milk (Mozzarella) and tree_nuts (Pinienkerne) — both inferred, card missed both.
      saladDish(
        'Rucola Salat',
        'Rucola mit Mozzarella, Oliven, Cherrytomaten, Basilikumpesto und Pinienkerne',
        890,
        [],
        ['milk', 'tree_nuts'],
      ),
    ],
  },
  {
    // Not on the printed card at all — the site's old "Limonade" page had no
    // prices, and the 2025 card lists no drinks. A dummy list mimicking a
    // typical Ma Pasta / German-Italian drinks menu, per Manish's steer.
    name: 'Getränke',
    taxClassId: 'beverage',
    dishes: [
      dummyDish('Hausgemachte Limonade Zitrone-Minze', 'Frisch gepresste Zitrone, Minze, Soda', 450, [], []),
      dummyDish('Hausgemachte Limonade Mango-Maracuja', 'Mango, Maracuja, Soda', 450, [], []),
      dummyDish('Coca-Cola', '0,3l', 350, [], ['caffeine']),
      dummyDish('Fanta', '0,3l', 350, [], []),
      dummyDish('Sprite', '0,3l', 350, [], []),
      dummyDish('Mineralwasser still', '0,5l', 350, [], []),
      dummyDish('Mineralwasser spritzig', '0,5l', 350, [], []),
      dummyDish('Pils vom Fass', '0,3l', 450, ['gluten'], []),
      dummyDish('Alkoholfreies Bier', '0,33l, Flasche', 400, ['gluten'], []),
      dummyDish('Hauswein Rot', '0,2l', 550, ['sulphites'], []),
      dummyDish('Hauswein Weiß', '0,2l', 550, ['sulphites'], []),
      dummyDish('Espresso', '', 250, [], ['caffeine']),
      dummyDish('Cappuccino', '', 350, ['milk'], ['caffeine']),
    ],
  },
  {
    // Not on the printed card either — a small dessert list to round out the
    // menu, per Manish's steer. Tiramisu is the one he explicitly asked for.
    name: 'Dessert',
    taxClassId: 'food',
    dishes: [
      dummyDish(
        'Tiramisu',
        'Löffelbiskuit, Mascarpone, Espresso, Kakao',
        650,
        ['eggs', 'milk', 'gluten'],
        [],
      ),
      dummyDish('Panna Cotta', 'Vanille-Sahne-Dessert mit Beerensauce', 600, ['milk'], []),
    ],
  },
];
