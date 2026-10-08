import type { Category } from '../../src/domain/category/Category';
import type { Order, CustomerAddress, DeliveryAddress, OrderCharge } from '../../src/domain/order/Order';
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

export const CARD_SHOP: Shop = {
  id: 'shop-1',
  slug: 'mapasta',
  name: 'Ma Pasta',
  isDeleted: false,
  isPaused: false,
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
  stripe: { connectAccountId: 'acct_1', connectOnboardingStatus: 'complete' },
  legal: COMPLETE_LEGAL,
  dpaAcceptance: ACCEPTED_DPA,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
};

export const PLACED_CARD_ORDER: Order = {
  id: 'o1',
  shopId: 'shop-1',
  orderRef: 'AB3-K7P',
  state: 'PLACED',
  fulfilmentMode: 'collection',
  payment: { method: 'card', status: 'authorized', stripePaymentIntentId: 'pi_1' },
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
  autoRejectAt: '2026-10-05T10:10:00.000Z',
  history: [{ from: null, to: 'PLACED', at: '2026-10-05T10:00:00.000Z', actor: { type: 'customer' } }],
  createdAt: '2026-10-05T10:00:00.000Z',
  updatedAt: '2026-10-05T10:00:00.000Z',
};

export const ADDRESS: CustomerAddress = {
  street: 'Musterstraße 1',
  postcode: '60311',
  city: 'Frankfurt am Main',
  country: 'Deutschland',
};

export const ACCEPTED_CARD_ORDER: Order = {
  ...PLACED_CARD_ORDER,
  state: 'ACCEPTED',
  payment: { method: 'card', status: 'paid', stripePaymentIntentId: 'pi_1' },
  acceptedAt: '2026-10-05T10:05:00.000Z',
  readyAt: '2026-10-05T10:25:00.000Z',
  prepMinutes: 20,
  usagePeriodKey: '2026-10',
  autoRejectAt: undefined,
  history: [
    ...PLACED_CARD_ORDER.history,
    { from: 'PLACED', to: 'ACCEPTED', at: '2026-10-05T10:05:00.000Z', actor: { type: 'staff', id: 's1' } },
  ],
  updatedAt: '2026-10-05T10:05:00.000Z',
};

/** Carbonara 1 x 10,50 at 7 % plus Cola 2 x 3,50 at 19 %: the refund-by-items fixture. */
export const ACCEPTED_TWO_LINE_ORDER: Order = {
  ...ACCEPTED_CARD_ORDER,
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
    {
      productId: 'p2',
      productName: 'Cola',
      quantity: 2,
      unitPriceCents: 350,
      lineTotalCents: 700,
      taxClassId: 'beverage',
      taxRateBasisPoints: 1900,
      taxCents: 112,
    },
  ],
  subtotalCents: 1750,
  taxBreakdown: [
    { rateBasisPoints: 700, grossCents: 1050, taxCents: 69 },
    { rateBasisPoints: 1900, grossCents: 700, taxCents: 112 },
  ],
};

/** An order from before 4b: paid in person. Read as 'not_paid_online'; never captured, released, refunded or invoiced. */
export const LEGACY_CASH_ORDER = {
  ...PLACED_CARD_ORDER,
  payment: { method: 'cash', status: 'cash_due', stripePaymentIntentId: null },
  idempotencyKey: 'key-12345678',
} as unknown as Order;

/** An in-memory stand-in for the order repository: version-stamped read and write-if-unchanged. */
export function orderStore(initial: Order) {
  let current = initial;
  let n = 1;
  return {
    findOrderWithEtag: async () => ({ order: current, etag: `etag-${n}` }),
    replaceOrderIfMatch: async (next: Order) => {
      current = next;
      n += 1;
      return 'ok' as const;
    },
    get current(): Order {
      return current;
    },
  };
}

export const DINE_IN_SHOP: Shop = { ...CARD_SHOP, orderSettings: { autoRejectMinutes: 10, alertEmail: null, autoAccept: true, dineIn: true } };
export const PLACED_TABLE_ORDER: Order = { ...PLACED_CARD_ORDER, id: 'o2', fulfilmentMode: 'dine_in', table: { label: '7' } };

export const DELIVERY_ZONE = { postcode: '10115', feeCents: 250, minOrderCents: 1500 };
export const DELIVERY_SHOP: Shop = { ...CARD_SHOP, orderSettings: { delivery: true, deliveryZones: [DELIVERY_ZONE] } };
export const DELIVERY_ADDRESS: DeliveryAddress = { street: 'Teststraße 1', postcode: '10115', city: 'Berlin' };
export const FEE_CHARGE: OrderCharge = { kind: 'delivery_fee', grossCents: 250, taxClassId: 'food', taxRateBasisPoints: 700, taxCents: 16 };
const DELIVERY_FIELDS = {
  fulfilmentMode: 'delivery' as const,
  deliveryAddress: DELIVERY_ADDRESS,
  charges: [FEE_CHARGE],
  totalCents: 1300,
  taxBreakdown: [{ rateBasisPoints: 700, grossCents: 1300, taxCents: 85 }],
};
export const PLACED_DELIVERY_ORDER: Order = { ...PLACED_CARD_ORDER, id: 'o3', ...DELIVERY_FIELDS };
export const ACCEPTED_DELIVERY_ORDER: Order = {
  ...ACCEPTED_CARD_ORDER,
  id: 'o3',
  ...DELIVERY_FIELDS,
  readyAt: '2026-10-05T10:50:00.000Z',
  prepMinutes: 45,
};
