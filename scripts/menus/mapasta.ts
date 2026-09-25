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
  printedCodes: number[];
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

function pastaDish(name: string, description: string, price: number, printedCodes: number[]): SeedDish {
  return { name, description, price, printedCodes, groups: [PASTA, TEIG, EXTRAS] };
}

function lasagneDish(name: string, description: string, price: number, printedCodes: number[]): SeedDish {
  return { name, description, price, printedCodes, groups: [] };
}

function saladDish(name: string, description: string, price: number, printedCodes: number[]): SeedDish {
  return { name, description, price, printedCodes, groups: [DRESSING, EXTRAS] };
}

export const MA_PASTA_MENU: SeedCategory[] = [
  {
    name: 'Pasta',
    taxClassId: 'food',
    dishes: [
      pastaDish('Pomodoro', 'Tomatensauce und Grana Padano', 1050, [6]),
      pastaDish(
        'Peperoncino',
        'Chili-Peperoni, Kirschtomaten, Knoblauch und frische Kräuter in Olivenöl geschwenkt',
        1150,
        [],
      ),
      pastaDish('Salvia', 'Frischer Salbei und Grana Padano in Butter und Weißwein geschwenkt', 1150, [6]),
      pastaDish(
        'Ricotta',
        'Pesto aus frischem Basilikum und Spinat, geröstete Mandeln, Ricotta-Käse, Kirschtomaten, Rucola',
        1250,
        [6, 8, 12],
      ),
      pastaDish('Pesto Verde', 'Basilikumpesto, Olivenöl, geröstete Pinienkerne, Rucola, Grana Padano', 1250, [8]),
      pastaDish(
        'Pesto Rosso',
        'Pesto getr. Tomaten, Oliven, Hirtenkäse, geröstete Mandeln, Rucola, Grana Padano',
        1250,
        [8, 12],
      ),
      pastaDish(
        'Verdure',
        'Broccoli, Champignons, Kirschtomaten und Zucchini in Knoblauch-Olivenöl geschwenkt',
        1350,
        [],
      ),
      pastaDish('Pancetta', 'Scharfe Tomatensauce, Speck, Chilischoten, Oliven', 1290, [1, 2, 7]),
      pastaDish('Carbonara', 'Speck und Eigelb in Sahnesauce, Grana Padano', 1390, []),
      pastaDish('Bolognese', 'Rinderhackfleisch in Tomatensauce, Grana Padano', 1390, []),
      pastaDish('Funghi', 'Champignons, Knoblauch und Kräuter in Sahnesauce mit Grana Padano', 1390, [1, 2, 6, 7]),
      pastaDish('Ortolana', 'Gorgonzola-Käse und frischer Spinat in Kräuter-Sahnesauce', 1390, [6, 8]),
      pastaDish(
        'Di Capra',
        'Ziegenfrischkäse, Sahne, getrocknete Tomaten, Thymian, gehackte Walnüsse und würziger Waldhonig',
        1450,
        [6, 8],
      ),
      pastaDish('Tartufata', 'Schwarze Trüffelpesto, Kirschtomaten, Pinienkerne, Rucola, Grana Padano', 1450, [5, 6]),
      pastaDish(
        'Mango Chili Pesto',
        'Ziegenfrischkäse, Mango, Chili, geröstete Mandeln, Rucola, Grana Padano',
        1390,
        [],
      ),
      pastaDish('Fitness', 'Hähnchenstreifen, Kirschtomaten, Champignons, Broccoli, Grana Padano', 1550, [6, 11]),
      pastaDish(
        'Chorizo',
        'Chorizo (span. Wurst), Oliven, Chili, Kirschtomaten in Knoblauch und Kräutern gebraten, Grana Padano',
        1550,
        [1, 2, 3],
      ),
      pastaDish('Gamberetti', 'Scampi, Zucchini, Kirschtomaten, frische Kräuter in Weißwein geschwenkt', 1690, [4, 10]),
      pastaDish('Salmone', 'Lachsfilet, frischer Spinat und Kräuter in Weißwein-Sahnesauce', 1690, [6, 9]),
      pastaDish(
        'Manzo',
        'Rinderstreifen, getrocknete Tomaten, Kräuter in Knoblauch-Olivenöl, Rucola, Pinienkerne, Grana Padano',
        1650,
        [6],
      ),
      pastaDish(
        'Mare',
        'Scampi, Tintenfisch, Miesmuscheln, Tomatensauce Knoblauch, Kirschtomaten und Kräuter in Weißwein geschwenkt',
        1650,
        [9, 10],
      ),
    ],
  },
  {
    name: 'Lasagne',
    taxClassId: 'food',
    dishes: [
      lasagneDish('Lasagne Rossa', 'Gefüllt mit Käse in Tomaten-Sahne-Sauce und mit Mozzarella überbacken', 1190, [12]),
      lasagneDish(
        'Lasagne Classica',
        'Gefüllt mit Rinderhackfleisch und Käse in Tomaten-Sahne-Sauce und mit Käse überbacken',
        1390,
        [6, 11],
      ),
      lasagneDish(
        'Lasagne Caprese',
        'Gefüllt mit Mozzarella, Cherrytomaten und Basilikum in Pesto-Sahne-Sauce und mit Mozzarella überbacken',
        1390,
        [6, 11, 12],
      ),
      lasagneDish(
        'Lasagne Spinaci',
        'Gefüllt mit frischem Spinat, Ricottakäse, Cherrytomaten und Kräutern in Spinat-Pesto-Sahne-Sauce und mit Mozzarella überbacken',
        1490,
        [6, 11, 12],
      ),
      lasagneDish(
        'Lasagne Capra',
        'Gefüllt mit Ziegenfrischkäse, Pesto aus getrockneten Tomaten und Walnüssen in Thymian-Sahne-Sauce, Waldhonig und mit Käse überbacken',
        1590,
        [6, 11],
      ),
      lasagneDish(
        'Lasagne Tartufata',
        'Gefüllt mit Käse, Cherrytomaten und frischen Champignons in Sahnesauce aus schwarzem Trüffelpesto und mit Grana Padano überbacken',
        1590,
        [5, 6, 11],
      ),
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
      saladDish(
        'Basis Salat',
        'Bunt gemischter Salat der Saison mit Rucola, Kirschtomaten, Gurken, Karotten, Zwiebeln und Mais',
        890,
        [],
      ),
      saladDish(
        'Rucola Salat',
        'Rucola mit Mozzarella, Oliven, Cherrytomaten, Basilikumpesto und Pinienkerne',
        890,
        [],
      ),
    ],
  },
];
