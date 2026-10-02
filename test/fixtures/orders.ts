import type { Category } from '../../src/domain/category/Category';
import type { Order } from '../../src/domain/order/Order';
import type { Product } from '../../src/domain/product/Product';
import type { Shop } from '../../src/domain/shop/Shop';
import { ACCEPTED_DPA, COMPLETE_LEGAL } from './legal';

const DAY = [{ open: '11:00', close: '22:00' }];
export const LUNCH_HOURS: Shop['openingHours'] = {
  mon: DAY,
  tue: DAY,
  wed: DAY,
  thu: DAY,
  fri: DAY,
  sat: DAY,
  sun: DAY,
};

// 12:00 and 23:00 in Berlin on Monday 2026-10-05
export const NOW_OPEN = new Date('2026-10-05T10:00:00Z');
export const NOW_CLOSED = new Date('2026-10-05T21:00:00Z');

const CATEGORY_FILLER = {
  shopId: 'shop-1',
  name: 'Category',
  sortOrder: 0,
  isDeleted: false,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
};
export const CATEGORIES = [
  { ...CATEGORY_FILLER, id: 'pasta', taxClassId: 'food' },
  { ...CATEGORY_FILLER, id: 'drinks', taxClassId: 'beverage' },
] as Category[];

const PRODUCT_BASE = {
  shopId: 'shop-1',
  description: '',
  images: [],
  additiveIds: [] as string[],
  dietaryTagIds: [],
  spiceLevel: null,
  prepMinutes: null,
  taxClassId: null,
  schedule: null,
  isAvailable: true,
  isDeleted: false,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
};

export const P_PASTA: Product = {
  ...PRODUCT_BASE,
  id: 'p1',
  name: 'Carbonara',
  nameTranslations: { en: 'Carbonara (EN)' },
  price: 1050,
  categoryIds: ['pasta'],
  variantGroups: [
    {
      id: 'vg',
      name: 'Größe',
      options: [
        { id: 'big', name: 'Groß', priceDelta: 300, isAvailable: true },
        { id: 'off', name: 'XXL', priceDelta: 500, isAvailable: false },
      ],
    },
  ],
  addonGroups: [
    {
      id: 'ag',
      name: 'Extras',
      minSelectable: 0,
      maxSelectable: 2,
      options: [
        { id: 'parm', name: 'Parmesan', priceDelta: 100, isAvailable: true },
        { id: 'egg', name: 'Ei', priceDelta: 50, isAvailable: true },
      ],
    },
  ],
  allergenIds: ['gluten'],
};

export const P_COLA: Product = {
  ...PRODUCT_BASE,
  id: 'p2',
  name: 'Cola',
  price: 350,
  categoryIds: ['drinks'],
  allergenIds: [],
};

export const P_SALAD: Product = {
  ...PRODUCT_BASE,
  id: 'p3',
  name: 'Insalata',
  price: 900,
  categoryIds: ['pasta'],
  allergenIds: [],
  addonGroups: [
    {
      id: 'dr',
      name: 'Dressing',
      minSelectable: 1,
      maxSelectable: 1,
      options: [
        { id: 'oil', name: 'Öl', priceDelta: 0, isAvailable: true },
        { id: 'yog', name: 'Joghurt', priceDelta: 0, isAvailable: true },
      ],
    },
  ],
};

export const CASH_SHOP: Shop = {
  id: 'shop-1',
  slug: 'mapasta',
  name: 'Ma Pasta',
  isDeleted: false,
  isPaused: false,
  paymentPolicy: 'pay_in_person',
  orderAcceptanceMode: 'auto',
  currency: 'EUR',
  timezone: 'Europe/Berlin',
  minOrderAmountCents: 0,
  address: {},
  openingHours: LUNCH_HOURS,
  closures: [],
  members: [{ userId: 'u1', role: 'owner', isActive: true }],
  countryCode: 'DE',
  menuLanguages: ['de'],
  branding: null,
  stripe: null,
  legal: COMPLETE_LEGAL,
  dpaAcceptance: ACCEPTED_DPA,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
};

export const PLACED_CASH_ORDER: Order = {
  id: 'o1',
  shopId: 'shop-1',
  orderRef: 'AB3-K7P',
  state: 'PLACED',
  fulfilmentMode: 'collection',
  payment: { method: 'cash', status: 'cash_due', stripePaymentIntentId: null },
  items: [
    {
      productId: 'p1',
      productName: 'Carbonara',
      quantity: 1,
      unitPriceCents: 1050,
      lineTotalCents: 1050,
      taxClassId: 'food',
      taxRateBasisPoints: 700,
      taxCents: 69,
    },
  ],
  subtotalCents: 1050,
  currency: 'EUR',
  customerName: 'Anna',
  customerEmail: 'a@example.com',
  customerPhone: '+49 30 1234',
  taxBreakdown: [{ rateBasisPoints: 700, grossCents: 1050, taxCents: 69 }],
  language: 'de',
  legalRevisions: { terms: 1, withdrawal: 1 },
  customerAccessToken: 'T'.repeat(32),
  idempotencyKey: 'key-12345678',
  autoRejectAt: '2026-10-05T10:10:00.000Z',
  history: [{ from: null, to: 'PLACED', at: '2026-10-05T10:00:00.000Z', actor: { type: 'customer' } }],
  createdAt: '2026-10-05T10:00:00.000Z',
  updatedAt: '2026-10-05T10:00:00.000Z',
};
