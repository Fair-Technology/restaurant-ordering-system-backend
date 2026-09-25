import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { seedTaxRatesForCountry } from '../src/application/_shared/countryTaxRates';
import { periodKeyFor } from '../src/domain/usage/usagePeriod';
import { hashPassword } from '../src/infrastructure/auth/passwordHashing';
import { assertSeedTargetIsDev } from './seedGuard';

// ── 1. Load env vars BEFORE Cosmos modules initialize ────────────────────────
// Cosmos client reads process.env at module load time, so env vars must be
// populated before the first require() of any cosmos module.
const settingsPath = path.join(__dirname, '..', 'local.settings.json');
if (fs.existsSync(settingsPath)) {
  const raw = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  Object.assign(process.env, raw.Values ?? {});
  console.log('✅ Loaded local.settings.json');
} else {
  console.warn('⚠️  local.settings.json not found — using defaults (Cosmos emulator)');
}

// Refuse to run against anything but the restaurant-ordering dev database —
// this wipes almost every container, so the wrong endpoint must fail loudly
// before any delete runs.
assertSeedTargetIsDev(process.env.COSMOS_DB_ENDPOINT ?? process.env.COSMOS_ENDPOINT);

// ── 2. Require Cosmos modules AFTER env vars are populated ────────────────────
/* eslint-disable @typescript-eslint/no-var-requires */
const {
  shopContainer,
  productContainer,
  categoryContainer,
  orderContainer,
  subscriptionContainer,
  planContainer,
  planPricingContainer,
  usageContainer,
  checkoutSessionContainer,
  auditLogsContainer,
  systemConfigContainer,
  staffAccountsContainer,
} = require('../src/infrastructure/cosmos/cosmosClient');
const { createShop } =
  require('../src/infrastructure/cosmos/shop/CosmosShopRepository');
const { createCategory } =
  require('../src/infrastructure/cosmos/category/CosmosCategoryRepository');
const { createProduct } =
  require('../src/infrastructure/cosmos/product/CosmosProductRepository');
const { createPlan } =
  require('../src/infrastructure/cosmos/plan/CosmosPlanRepository');
const { upsertPricing } =
  require('../src/infrastructure/cosmos/plan/CosmosPlanPricingRepository');
const { upsertSubscription } =
  require('../src/infrastructure/cosmos/subscription/CosmosSubscriptionRepository');
const { upsertUsage } =
  require('../src/infrastructure/cosmos/usage/CosmosUsageRepository');
const { createStaffAccount } =
  require('../src/infrastructure/cosmos/staff/CosmosStaffAccountRepository');
/* eslint-enable @typescript-eslint/no-var-requires */

// ── Helpers ───────────────────────────────────────────────────────────────────
const now = () => new Date().toISOString();
const img = (photoId: string, alt: string) => ({
  id: randomUUID(),
  url: `https://images.unsplash.com/photo-${photoId}?w=800&auto=format&fit=crop`,
  alt,
  sortOrder: 0,
  createdAt: now(),
});

// ── 3. Delete ALL existing data ───────────────────────────────────────────────
// users is never wiped — no seeder gets to invent who has signed in.
async function tryDelete(item: any): Promise<void> {
  try {
    await item.delete();
  } catch (e: any) {
    if (e?.code !== 404) throw e;
  }
}

async function deleteAll(): Promise<void> {
  console.log('\n🗑️  Deleting all existing data...');

  const { resources: shops } = await shopContainer.items
    .query('SELECT c.id FROM c')
    .fetchAll();
  for (const s of shops) await tryDelete(shopContainer.item(s.id, s.id));
  console.log(`   Deleted ${shops.length} shop(s)`);

  const { resources: products } = await productContainer.items
    .query('SELECT c.id, c.shopId FROM c')
    .fetchAll();
  for (const p of products) await tryDelete(productContainer.item(p.id, p.shopId));
  console.log(`   Deleted ${products.length} product(s)`);

  const { resources: cats } = await categoryContainer.items
    .query('SELECT c.id, c.shopId FROM c')
    .fetchAll();
  for (const c of cats) await tryDelete(categoryContainer.item(c.id, c.shopId));
  console.log(`   Deleted ${cats.length} categor(ies)`);

  const { resources: orders } = await orderContainer.items
    .query('SELECT c.id FROM c')
    .fetchAll();
  // orders partition by /id, not /shopId
  for (const o of orders) await tryDelete(orderContainer.item(o.id, o.id));
  console.log(`   Deleted ${orders.length} order(s)`);

  const { resources: subs } = await subscriptionContainer.items
    .query('SELECT c.id FROM c')
    .fetchAll();
  for (const s of subs) await tryDelete(subscriptionContainer.item(s.id, s.id));
  console.log(`   Deleted ${subs.length} subscription(s)`);

  const { resources: plansRes } = await planContainer.items
    .query('SELECT c.id FROM c')
    .fetchAll();
  for (const p of plansRes) await tryDelete(planContainer.item(p.id, p.id));
  console.log(`   Deleted ${plansRes.length} plan(s)`);

  const { resources: pricingRes } = await planPricingContainer.items
    .query('SELECT c.id FROM c')
    .fetchAll();
  for (const p of pricingRes) await tryDelete(planPricingContainer.item(p.id, p.id));
  console.log(`   Deleted ${pricingRes.length} plan pricing row(s)`);

  const { resources: usageRes } = await usageContainer.items
    .query('SELECT c.id FROM c')
    .fetchAll();
  for (const u of usageRes) await tryDelete(usageContainer.item(u.id, u.id));
  console.log(`   Deleted ${usageRes.length} usage doc(s)`);

  const { resources: sessions } = await checkoutSessionContainer.items
    .query('SELECT c.id FROM c')
    .fetchAll();
  for (const s of sessions) await tryDelete(checkoutSessionContainer.item(s.id, s.id));
  console.log(`   Deleted ${sessions.length} checkout session(s)`);

  const { resources: audits } = await auditLogsContainer.items
    .query('SELECT c.id FROM c')
    .fetchAll();
  for (const a of audits) await tryDelete(auditLogsContainer.item(a.id, a.id));
  console.log(`   Deleted ${audits.length} audit log entr(ies)`);

  const { resources: configs } = await systemConfigContainer.items
    .query('SELECT c.id FROM c')
    .fetchAll();
  for (const c of configs) await tryDelete(systemConfigContainer.item(c.id, c.id));
  console.log(`   Deleted ${configs.length} system config doc(s)`);

  const { resources: staffAccounts } = await staffAccountsContainer.items
    .query('SELECT c.id, c.shopId FROM c')
    .fetchAll();
  for (const s of staffAccounts) await tryDelete(staffAccountsContainer.item(s.id, s.shopId));
  console.log(`   Deleted ${staffAccounts.length} staff account(s)`);
}

// ── 4. Seed plans ─────────────────────────────────────────────────────────────
const PLAN_DEFS = [
  {
    id: 'plan-basic', name: 'Basic', internalKey: 'free', isDefault: true, sortOrder: 1,
    limits: [{ key: 'ORDERS_PER_MONTH', value: 30 }, { key: 'STAFF_ACCOUNTS', value: 5 }],
    monthlyAmountCents: 0, yearlyAmountCents: 0,
  },
  {
    id: 'plan-pro', name: 'Pro', internalKey: 'pro', isDefault: false, sortOrder: 2,
    limits: [{ key: 'ORDERS_PER_MONTH', value: 300 }, { key: 'STAFF_ACCOUNTS', value: 5 }],
    monthlyAmountCents: 2900, yearlyAmountCents: 29000,
  },
  {
    id: 'plan-max', name: 'Max', internalKey: 'max', isDefault: false, sortOrder: 3,
    limits: [{ key: 'ORDERS_PER_MONTH', value: -1 }, { key: 'STAFF_ACCOUNTS', value: 5 }],
    monthlyAmountCents: 5900, yearlyAmountCents: 59000,
  },
];

async function seedPlans(): Promise<void> {
  console.log('\n📦 Creating plans...');

  for (const def of PLAN_DEFS) {
    const ts = now();
    await createPlan({
      id: def.id,
      name: def.name,
      internalKey: def.internalKey,
      isDefault: def.isDefault,
      isVisible: true,
      sortOrder: def.sortOrder,
      limits: def.limits,
      createdAt: ts,
      updatedAt: ts,
    });
    await upsertPricing({
      id: `pricing-${def.id.replace('plan-', '')}-eur`,
      planId: def.id,
      currency: 'EUR',
      monthlyAmountCents: def.monthlyAmountCents,
      yearlyAmountCents: def.yearlyAmountCents,
      billingPriceIdMonthly: null,
      billingPriceIdYearly: null,
      isActive: true,
      createdAt: ts,
      updatedAt: ts,
    });
    console.log(`   ✓ ${def.name} (${def.id})`);
  }
}

// ── 5. Seed shops ─────────────────────────────────────────────────────────────
async function seedShops(): Promise<any[]> {
  console.log('\n🏪 Creating shops...');

  const weekdayHours = [{ open: '11:00', close: '21:00' }];
  const weekendHours = [{ open: '10:00', close: '22:00' }];
  const closed: never[] = [];

  const ownerOid = process.env.SEED_OWNER_OID;
  if (!ownerOid) {
    console.warn('⚠️  SEED_OWNER_OID not set — shops have no owner');
  }
  const members = ownerOid
    ? [{ userId: ownerOid, role: 'owner' as const, isActive: true }]
    : [];

  // `key` is the old (Australian) shop name, kept only so category and
  // product lookups below — still keyed by the original names — don't need
  // rewriting. `name` is the new German trading name that is actually stored.
  const shopDefs = [
    {
      key: 'Belconnen Pizza Palace',
      name: 'Pizzeria Kreuzberg',
      industry: 'restaurant',
      address: { street: 'Oranienstraße 12', city: 'Berlin', state: 'Berlin', postcode: '10999', country: 'Deutschland' },
      openingHours: { mon: closed, tue: weekdayHours, wed: weekdayHours, thu: weekdayHours, fri: weekdayHours, sat: weekendHours, sun: weekendHours },
      branding: {
        logoUrl: null,
        heroImageUrl: null,
        colors: { primary: '#C0392B', secondary: '#E74C3C', tertiary: '#F39C12', background: '#FDF2F8' },
      },
    },
    {
      key: 'Manuka Sushi & Ramen',
      name: 'Sushi & Ramen Schwabing',
      industry: 'restaurant',
      address: { street: 'Leopoldstraße 45', city: 'München', state: 'Bayern', postcode: '80802', country: 'Deutschland' },
      openingHours: { mon: weekdayHours, tue: weekdayHours, wed: weekdayHours, thu: weekdayHours, fri: weekdayHours, sat: weekendHours, sun: [{ open: '12:00', close: '20:00' }] },
      branding: {
        logoUrl: null,
        heroImageUrl: null,
        colors: { primary: '#2C3E50', secondary: '#3498DB', tertiary: '#1ABC9C', background: '#F0F4F8' },
      },
    },
    {
      key: 'Civic Burger Co.',
      name: 'Burger Werk Altona',
      industry: 'restaurant',
      address: { street: 'Große Bergstraße 180', city: 'Hamburg', state: 'Hamburg', postcode: '22767', country: 'Deutschland' },
      openingHours: { mon: weekdayHours, tue: weekdayHours, wed: weekdayHours, thu: weekdayHours, fri: [{ open: '11:00', close: '23:00' }], sat: [{ open: '10:00', close: '23:00' }], sun: weekendHours },
      branding: {
        logoUrl: null,
        heroImageUrl: null,
        colors: { primary: '#E67E22', secondary: '#D35400', tertiary: '#F1C40F', background: '#FFFBF0' },
      },
    },
    {
      key: 'Kingston Café',
      name: 'Café am Rhein',
      industry: 'cafe',
      address: { street: 'Rheinuferstraße 3', city: 'Köln', state: 'Nordrhein-Westfalen', postcode: '50668', country: 'Deutschland' },
      openingHours: { mon: [{ open: '07:00', close: '15:00' }], tue: [{ open: '07:00', close: '15:00' }], wed: [{ open: '07:00', close: '15:00' }], thu: [{ open: '07:00', close: '15:00' }], fri: [{ open: '07:00', close: '15:00' }], sat: [{ open: '08:00', close: '14:00' }], sun: closed },
      branding: {
        logoUrl: null,
        heroImageUrl: null,
        colors: { primary: '#27AE60', secondary: '#229954', tertiary: '#A3CB38', background: '#F0FFF4' },
      },
    },
    {
      key: 'Spice of India',
      name: 'Spice of India Frankfurt',
      industry: 'restaurant',
      address: { street: 'Berger Straße 90', city: 'Frankfurt am Main', state: 'Hessen', postcode: '60316', country: 'Deutschland' },
      openingHours: { mon: closed, tue: weekdayHours, wed: weekdayHours, thu: weekdayHours, fri: weekdayHours, sat: weekendHours, sun: weekendHours },
      branding: null, // ← no branding; frontend should use default colours
    },
  ];

  const created: any[] = [];
  for (const def of shopDefs) {
    const shopId = randomUUID();
    const slug = def.name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')  // strip combining accents (é → e)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const ts = now();
    const taxRates = seedTaxRatesForCountry('DE');
    const shop = await createShop({
      id: shopId,
      slug,
      name: def.name,
      industry: def.industry,
      isDeleted: false,
      isPaused: true,
      paymentPolicy: 'pay_online',
      orderAcceptanceMode: 'auto',
      currency: 'EUR',
      timezone: 'Europe/Berlin',
      minOrderAmountCents: 1500,
      countryCode: 'DE',
      taxRates,
      address: def.address,
      openingHours: def.openingHours,
      closures: [],
      members,
      branding: def.branding,
      createdAt: ts,
      updatedAt: ts,
    });
    created.push({ ...shop, key: def.key, taxRates });
    console.log(`   ✓ ${shop.name} (${shop.slug})`);
  }
  return created;
}

// ── 6. Seed categories ────────────────────────────────────────────────────────
async function seedCategories(shops: any[]): Promise<Map<string, any[]>> {
  console.log('\n📂 Creating categories...');

  const categoryMap: Record<string, string[]> = {
    'Belconnen Pizza Palace': ['Pizzas', 'Pastas', 'Drinks'],
    'Manuka Sushi & Ramen':   ['Sushi Rolls', 'Ramen & Soups', 'Sides'],
    'Civic Burger Co.':        ['Burgers', 'Sides & Fries', 'Shakes & Drinks'],
    'Kingston Café':           ['Breakfast', 'Lunch', 'Beverages'],
    'Spice of India':          ['Curries', 'Breads & Rice', 'Desserts'],
  };

  const result = new Map<string, any[]>();

  for (const shop of shops) {
    const names = categoryMap[shop.key] ?? [];
    const cats: any[] = [];
    for (let i = 0; i < names.length; i++) {
      const ts = now();
      const cat = await createCategory({
        id: randomUUID(),
        shopId: shop.id,
        name: names[i],
        sortOrder: i + 1,
        isDeleted: false,
        createdAt: ts,
        updatedAt: ts,
      });
      cats.push(cat);
    }
    result.set(shop.id, cats);
    console.log(`   ✓ ${shop.name}: ${names.join(', ')}`);
  }

  return result;
}

// ── 7. Seed products ──────────────────────────────────────────────────────────
async function seedProducts(shops: any[], categoryMap: Map<string, any[]>): Promise<void> {
  console.log('\n🍽️  Creating products...');

  for (const shop of shops) {
    const cats = categoryMap.get(shop.id) ?? [];
    const cat = (name: string) => cats.find((c: any) => c.name === name)?.id ?? cats[0]?.id;

    const gstRateId = shop.taxRates?.[0]?.id ?? null;
    const products = buildProducts(shop.key, shop.id, cat, gstRateId);
    for (const productDef of products) {
      await createProduct(productDef);
      console.log(`   ✓ ${shop.name} → ${productDef.name} (€${(productDef.price / 100).toFixed(2)})`);
    }
  }
}

function buildProducts(shopKey: string, shopId: string, cat: (name: string) => string, taxRateId: string | null): any[] {
  const base = (overrides: object) => ({
    id: randomUUID(),
    shopId,
    images: [],
    isAvailable: true,
    isDeleted: false,
    variantGroups: [],
    addonGroups: [],
    taxRateId,
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  });

  // ── Belconnen Pizza Palace (now Pizzeria Kreuzberg) ──────────────────────
  if (shopKey === 'Belconnen Pizza Palace') {
    return [
      base({
        name: 'Margherita Pizza',
        description: 'San Marzano tomato base, fior di latte mozzarella, fresh basil, extra-virgin olive oil.',
        price: 1800,
        categoryIds: [cat('Pizzas')],
        images: [
          img('1513104890138-7c749659a591', 'Margherita pizza with fresh basil'),
          img('1574071318508-1cdbab80d002', 'Close-up margherita'),
        ],
        specialInfo: [
          { name: 'Contains Gluten', icon: 'Wheat' },
          { name: 'Contains Dairy', icon: 'Droplets' },
        ],
        variantGroups: [{
          id: randomUUID(), name: 'Size',
          options: [
            { id: randomUUID(), name: '9" Personal', priceDelta: 0, isAvailable: true },
            { id: randomUUID(), name: '12" Large',   priceDelta: 500, isAvailable: true },
          ],
        }],
        addonGroups: [{
          id: randomUUID(), name: 'Extra Toppings', minSelectable: 0, maxSelectable: 4,
          options: [
            { id: randomUUID(), name: 'Extra Mozzarella', priceDelta: 200, isAvailable: true },
            { id: randomUUID(), name: 'Kalamata Olives',   priceDelta: 150, isAvailable: true },
            { id: randomUUID(), name: 'Roasted Capsicum',  priceDelta: 150, isAvailable: true },
            { id: randomUUID(), name: 'Fresh Chilli',      priceDelta: 100, isAvailable: true },
          ],
        }],
      }),
      base({
        name: 'Pepperoni Pizza',
        description: 'Rich tomato sauce, mozzarella, generous rounds of spiced pepperoni, dried oregano.',
        price: 2200,
        categoryIds: [cat('Pizzas')],
        images: [
          img('1628840042765-356cda07504e', 'Pepperoni pizza golden crust'),
          img('1565299624946-b28f40a0ae38', 'Pepperoni close-up'),
        ],
        specialInfo: [
          { name: 'Contains Gluten', icon: 'Wheat' },
          { name: 'Contains Dairy', icon: 'Droplets' },
        ],
        variantGroups: [{
          id: randomUUID(), name: 'Size',
          options: [
            { id: randomUUID(), name: '9" Personal', priceDelta: 0, isAvailable: true },
            { id: randomUUID(), name: '12" Large',   priceDelta: 500, isAvailable: true },
          ],
        }],
        addonGroups: [{
          id: randomUUID(), name: 'Extras', minSelectable: 0, maxSelectable: 3,
          options: [
            { id: randomUUID(), name: 'Extra Pepperoni', priceDelta: 300, isAvailable: true },
            { id: randomUUID(), name: 'Jalapeños',       priceDelta: 150, isAvailable: true },
            { id: randomUUID(), name: 'Mushrooms',       priceDelta: 150, isAvailable: true },
          ],
        }],
      }),
      base({
        name: 'Spaghetti Carbonara',
        description: 'Al dente spaghetti, creamy egg yolk sauce, pancetta, Pecorino Romano, cracked black pepper.',
        price: 1600,
        categoryIds: [cat('Pastas')],
        images: [
          img('1612874742237-6526221588e3', 'Spaghetti carbonara with pancetta'),
        ],
        specialInfo: [
          { name: 'Contains Gluten', icon: 'Wheat' },
          { name: 'Contains Dairy', icon: 'Droplets' },
          { name: 'Contains Egg', icon: 'Egg' },
        ],
      }),
      base({
        name: 'San Pellegrino',
        description: 'Italian sparkling mineral water — the perfect companion to any pizza.',
        price: 400,
        categoryIds: [cat('Drinks')],
        images: [
          img('1616118132534-381148898bb4', 'San Pellegrino sparkling water can'),
        ],
        variantGroups: [{
          id: randomUUID(), name: 'Flavour',
          options: [
            { id: randomUUID(), name: 'Lemon & Mint',  priceDelta: 0, isAvailable: true },
            { id: randomUUID(), name: 'Blood Orange',   priceDelta: 0, isAvailable: true },
            { id: randomUUID(), name: 'Sparkling Plain', priceDelta: 0, isAvailable: true },
          ],
        }],
      }),
    ];
  }

  // ── Manuka Sushi & Ramen (now Sushi & Ramen Schwabing) ───────────────────
  if (shopKey === 'Manuka Sushi & Ramen') {
    return [
      base({
        name: 'Salmon Nigiri (8 pcs)',
        description: 'Premium Atlantic salmon hand-pressed over seasoned sushi rice. Served with pickled ginger and wasabi.',
        price: 1600,
        categoryIds: [cat('Sushi Rolls')],
        images: [
          img('1534482421-64566f976cfa', 'Salmon nigiri platter'),
          img('1583623025817-d180a2221d0a', 'Fresh salmon close-up'),
        ],
        specialInfo: [
          { name: 'Contains Fish', icon: 'Fish' },
          { name: 'Contains Allergens', icon: 'AlertTriangle' },
        ],
      }),
      base({
        name: 'Dragon Roll',
        description: 'Prawn tempura and cucumber inside, topped with avocado and tobiko. Finished with teriyaki glaze.',
        price: 2200,
        categoryIds: [cat('Sushi Rolls')],
        images: [
          img('1617196034183-421b4040d609', 'Dragon roll topped with avocado'),
          img('1562802378-063ec186a863', 'Sushi rolls platter'),
        ],
        specialInfo: [
          { name: 'Contains Fish', icon: 'Fish' },
          { name: 'Contains Gluten', icon: 'Wheat' },
          { name: 'Contains Egg', icon: 'Egg' },
          { name: 'Contains Allergens', icon: 'AlertTriangle' },
        ],
        addonGroups: [{
          id: randomUUID(), name: 'Dipping Sauces', minSelectable: 0, maxSelectable: 2,
          options: [
            { id: randomUUID(), name: 'Soy Sauce (extra)',  priceDelta: 50,  isAvailable: true },
            { id: randomUUID(), name: 'Sriracha Mayo',      priceDelta: 100, isAvailable: true },
            { id: randomUUID(), name: 'Ponzu',              priceDelta: 100, isAvailable: true },
          ],
        }],
      }),
      base({
        name: 'Tonkotsu Ramen',
        description: 'Rich pork bone broth simmered 12 hours, chashu pork belly, soft boiled egg, nori, bamboo shoots, spring onion.',
        price: 1900,
        categoryIds: [cat('Ramen & Soups')],
        images: [
          img('1569050467447-ce54b3bbc37d', 'Tonkotsu ramen steaming bowl'),
          img('1591814468924-caf88d1232e1', 'Chashu pork ramen'),
        ],
        specialInfo: [
          { name: 'Contains Gluten', icon: 'Wheat' },
          { name: 'Contains Egg', icon: 'Egg' },
          { name: 'Contains Allergens', icon: 'AlertTriangle' },
        ],
        variantGroups: [{
          id: randomUUID(), name: 'Spice Level',
          options: [
            { id: randomUUID(), name: 'Mild',   priceDelta: 0, isAvailable: true },
            { id: randomUUID(), name: 'Medium',  priceDelta: 0, isAvailable: true },
            { id: randomUUID(), name: 'Hot 🌶️',  priceDelta: 0, isAvailable: true },
          ],
        }],
        addonGroups: [{
          id: randomUUID(), name: 'Extra Toppings', minSelectable: 0, maxSelectable: 3,
          options: [
            { id: randomUUID(), name: 'Extra Chashu',      priceDelta: 350, isAvailable: true },
            { id: randomUUID(), name: 'Extra Soft Egg',    priceDelta: 200, isAvailable: true },
            { id: randomUUID(), name: 'Corn',              priceDelta: 100, isAvailable: true },
            { id: randomUUID(), name: 'Extra Spring Onion', priceDelta: 50, isAvailable: true },
          ],
        }],
      }),
      base({
        name: 'Edamame',
        description: 'Steamed young soybeans seasoned with sea salt. Light, healthy and delicious.',
        price: 600,
        categoryIds: [cat('Sides')],
        images: [
          img('1615361200141-f45040f367be', 'Edamame in bowl with sea salt'),
        ],
        specialInfo: [
          { name: 'Vegan', icon: 'Leaf' },
          { name: 'Contains Allergens', icon: 'AlertTriangle' },
        ],
        variantGroups: [{
          id: randomUUID(), name: 'Seasoning',
          options: [
            { id: randomUUID(), name: 'Sea Salt',       priceDelta: 0, isAvailable: true },
            { id: randomUUID(), name: 'Garlic & Chilli', priceDelta: 0, isAvailable: true },
          ],
        }],
      }),
    ];
  }

  // ── Civic Burger Co. (now Burger Werk Altona) ────────────────────────────
  if (shopKey === 'Civic Burger Co.') {
    return [
      base({
        name: 'Classic Smash Burger',
        description: 'Two smashed beef patties, American cheddar, dill pickles, shredded lettuce, house burger sauce on a toasted brioche bun.',
        price: 1500,
        categoryIds: [cat('Burgers')],
        images: [
          img('1568901346375-23c9450c58cd', 'Classic smash burger cross-section'),
          img('1550547660-d9450f859349', 'Smash burger with fries'),
        ],
        specialInfo: [
          { name: 'Contains Gluten', icon: 'Wheat' },
          { name: 'Contains Dairy', icon: 'Droplets' },
          { name: 'Contains Egg', icon: 'Egg' },
        ],
        variantGroups: [{
          id: randomUUID(), name: 'Patty Count',
          options: [
            { id: randomUUID(), name: 'Single',  priceDelta: 0,   isAvailable: true },
            { id: randomUUID(), name: 'Double',  priceDelta: 500, isAvailable: true },
            { id: randomUUID(), name: 'Triple',  priceDelta: 900, isAvailable: true },
          ],
        }],
        addonGroups: [{
          id: randomUUID(), name: 'Sauce', minSelectable: 1, maxSelectable: 2,
          options: [
            { id: randomUUID(), name: 'House Burger Sauce', priceDelta: 0, isAvailable: true },
            { id: randomUUID(), name: 'Sriracha',           priceDelta: 0, isAvailable: true },
            { id: randomUUID(), name: 'Truffle Aioli',      priceDelta: 100, isAvailable: true },
          ],
        }],
      }),
      base({
        name: 'Bacon BBQ Burger',
        description: 'Smashed beef patty, streaky bacon, smoked cheddar, crispy onion rings, smoky BBQ sauce, brioche bun.',
        price: 1800,
        categoryIds: [cat('Burgers')],
        images: [
          img('1553979459-d2229ba7433b', 'Bacon BBQ burger with onion rings'),
          img('1571091718767-18b5b1457add', 'Burger from above'),
        ],
        specialInfo: [
          { name: 'Contains Gluten', icon: 'Wheat' },
          { name: 'Contains Dairy', icon: 'Droplets' },
          { name: 'Contains Egg', icon: 'Egg' },
        ],
        variantGroups: [{
          id: randomUUID(), name: 'Patty Count',
          options: [
            { id: randomUUID(), name: 'Single', priceDelta: 0,   isAvailable: true },
            { id: randomUUID(), name: 'Double', priceDelta: 500, isAvailable: true },
          ],
        }],
        addonGroups: [{
          id: randomUUID(), name: 'Extras', minSelectable: 0, maxSelectable: 4,
          options: [
            { id: randomUUID(), name: 'Extra Bacon',       priceDelta: 300, isAvailable: true },
            { id: randomUUID(), name: 'Fried Egg',         priceDelta: 200, isAvailable: true },
            { id: randomUUID(), name: 'Pickled Jalapeños', priceDelta: 100, isAvailable: true },
            { id: randomUUID(), name: 'Avocado',           priceDelta: 250, isAvailable: true },
          ],
        }],
      }),
      base({
        name: 'Loaded Fries',
        description: 'Crispy skin-on fries loaded with your choice of toppings. A must-have side.',
        price: 900,
        categoryIds: [cat('Sides & Fries')],
        images: [
          img('1573080496219-bb080dd4f877', 'Loaded fries overhead'),
          img('1585325701957-76ea5c8b36ab', 'Cheese fries close-up'),
        ],
        specialInfo: [
          { name: 'Contains Gluten', icon: 'Wheat' },
          { name: 'Contains Dairy', icon: 'Droplets' },
        ],
        addonGroups: [{
          id: randomUUID(), name: 'Toppings', minSelectable: 1, maxSelectable: 3,
          options: [
            { id: randomUUID(), name: 'Melted Cheddar',     priceDelta: 150, isAvailable: true },
            { id: randomUUID(), name: 'Crispy Bacon Bits',  priceDelta: 200, isAvailable: true },
            { id: randomUUID(), name: 'Pickled Jalapeños',  priceDelta: 100, isAvailable: true },
            { id: randomUUID(), name: 'Truffle Parmesan',   priceDelta: 250, isAvailable: true },
          ],
        }],
      }),
      base({
        name: 'Thick Shake',
        description: 'Hand-spun real ice-cream milkshake — thick, creamy, old-school.',
        price: 700,
        categoryIds: [cat('Shakes & Drinks')],
        images: [
          img('1563805042-7684c019e1cb', 'Thick chocolate milkshake'),
        ],
        specialInfo: [
          { name: 'Contains Dairy', icon: 'Droplets' },
        ],
        variantGroups: [{
          id: randomUUID(), name: 'Flavour',
          options: [
            { id: randomUUID(), name: 'Chocolate',   priceDelta: 0, isAvailable: true },
            { id: randomUUID(), name: 'Vanilla',     priceDelta: 0, isAvailable: true },
            { id: randomUUID(), name: 'Strawberry',  priceDelta: 0, isAvailable: true },
            { id: randomUUID(), name: 'Salted Caramel', priceDelta: 100, isAvailable: true },
          ],
        }],
      }),
    ];
  }

  // ── Kingston Café (now Café am Rhein) ────────────────────────────────────
  if (shopKey === 'Kingston Café') {
    return [
      base({
        name: 'Smashed Avo Toast',
        description: 'Sourdough toast topped with smashed avocado, heirloom cherry tomatoes, dukkah, micro herbs, lemon.',
        price: 1600,
        categoryIds: [cat('Breakfast')],
        images: [
          img('1525351484163-7529414344d8', 'Smashed avo toast with cherry tomatoes'),
          img('1482012792084-a0c3725f289f', 'Avocado toast overhead'),
        ],
        specialInfo: [
          { name: 'Contains Gluten', icon: 'Wheat' },
          { name: 'Contains Allergens', icon: 'AlertTriangle' },
          { name: 'Vegetarian', icon: 'Utensils' },
        ],
        addonGroups: [{
          id: randomUUID(), name: 'Add On', minSelectable: 0, maxSelectable: 2,
          options: [
            { id: randomUUID(), name: 'Poached Eggs (2)',  priceDelta: 300, isAvailable: true },
            { id: randomUUID(), name: 'Crispy Bacon',      priceDelta: 350, isAvailable: true },
            { id: randomUUID(), name: 'Smoked Salmon',     priceDelta: 500, isAvailable: true },
            { id: randomUUID(), name: 'Halloumi',          priceDelta: 350, isAvailable: true },
          ],
        }],
      }),
      base({
        name: 'Big Breakfast',
        description: 'Two eggs your way, bacon, grilled tomato, sautéed mushrooms, baked beans, hash brown, sourdough toast.',
        price: 2200,
        categoryIds: [cat('Breakfast')],
        images: [
          img('1504754524776-8f4f37790ca0', 'Full big breakfast plate'),
          img('1551782618-c2d09b0e4c3f', 'Eggs and bacon breakfast'),
        ],
        specialInfo: [
          { name: 'Contains Gluten', icon: 'Wheat' },
          { name: 'Contains Dairy', icon: 'Droplets' },
          { name: 'Contains Egg', icon: 'Egg' },
        ],
        variantGroups: [{
          id: randomUUID(), name: 'Eggs',
          options: [
            { id: randomUUID(), name: 'Scrambled', priceDelta: 0, isAvailable: true },
            { id: randomUUID(), name: 'Poached',   priceDelta: 0, isAvailable: true },
            { id: randomUUID(), name: 'Fried',     priceDelta: 0, isAvailable: true },
          ],
        }],
      }),
      base({
        name: 'Flat White',
        description: 'Double ristretto espresso with velvety steamed milk. Our house beans roasted locally.',
        price: 600,
        categoryIds: [cat('Beverages')],
        images: [
          img('1485808191679-5f86510bd3a7', 'Flat white coffee latte art'),
          img('1509042239860-f550ce710b93', 'Coffee in white cup'),
        ],
        specialInfo: [
          { name: 'Contains Dairy', icon: 'Droplets' },
          { name: 'Contains Caffeine', icon: 'Coffee' },
        ],
        variantGroups: [{
          id: randomUUID(), name: 'Milk',
          options: [
            { id: randomUUID(), name: 'Full Cream', priceDelta: 0,   isAvailable: true },
            { id: randomUUID(), name: 'Oat Milk',   priceDelta: 80,  isAvailable: true },
            { id: randomUUID(), name: 'Almond Milk', priceDelta: 80, isAvailable: true },
            { id: randomUUID(), name: 'Soy Milk',   priceDelta: 60,  isAvailable: true },
          ],
        }],
        addonGroups: [{
          id: randomUUID(), name: 'Extras', minSelectable: 0, maxSelectable: 2,
          options: [
            { id: randomUUID(), name: 'Extra Shot',    priceDelta: 60,  isAvailable: true },
            { id: randomUUID(), name: 'Decaf',         priceDelta: 0,   isAvailable: true },
            { id: randomUUID(), name: 'Vanilla Syrup', priceDelta: 80,  isAvailable: true },
            { id: randomUUID(), name: 'Caramel Syrup', priceDelta: 80,  isAvailable: true },
          ],
        }],
      }),
      base({
        name: 'Banana Bread',
        description: 'House-baked warm banana bread with whipped ricotta and seasonal fruit compote.',
        price: 800,
        categoryIds: [cat('Lunch')],
        images: [
          img('1587334274328-64186a80aeee', 'Sliced banana bread with butter'),
        ],
        specialInfo: [
          { name: 'Contains Gluten', icon: 'Wheat' },
          { name: 'Contains Egg', icon: 'Egg' },
          { name: 'Contains Dairy', icon: 'Droplets' },
          { name: 'Vegetarian', icon: 'Utensils' },
        ],
        addonGroups: [{
          id: randomUUID(), name: 'Serve With', minSelectable: 0, maxSelectable: 1,
          options: [
            { id: randomUUID(), name: 'Butter',           priceDelta: 0,   isAvailable: true },
            { id: randomUUID(), name: 'Whipped Ricotta',  priceDelta: 100, isAvailable: true },
            { id: randomUUID(), name: 'Ice Cream (1 scoop)', priceDelta: 200, isAvailable: true },
          ],
        }],
      }),
    ];
  }

  // ── Spice of India (now Spice of India Frankfurt) ────────────────────────
  if (shopKey === 'Spice of India') {
    return [
      base({
        name: 'Butter Chicken',
        description: 'Tender chicken cooked in a rich, creamy tomato-based sauce with aromatic spices. A classic North Indian favourite.',
        price: 1800,
        categoryIds: [cat('Curries')],
        images: [
          img('1585937421612-70a008356fbe', 'Butter chicken curry in bowl'),
          img('1631452180519-1b8dab981b82', 'Indian curry overhead'),
        ],
        specialInfo: [
          { name: 'Contains Dairy', icon: 'Droplets' },
          { name: 'Contains Allergens', icon: 'AlertTriangle' },
          { name: 'Spicy', icon: 'Flame' },
        ],
        variantGroups: [{
          id: randomUUID(), name: 'Spice Level',
          options: [
            { id: randomUUID(), name: 'Mild',          priceDelta: 0, isAvailable: true },
            { id: randomUUID(), name: 'Medium',        priceDelta: 0, isAvailable: true },
            { id: randomUUID(), name: 'Hot 🌶️',        priceDelta: 0, isAvailable: true },
            { id: randomUUID(), name: 'Extra Hot 🌶️🌶️', priceDelta: 0, isAvailable: true },
          ],
        }],
        addonGroups: [{
          id: randomUUID(), name: 'Serve With', minSelectable: 0, maxSelectable: 1,
          options: [
            { id: randomUUID(), name: 'Steamed Basmati Rice', priceDelta: 300, isAvailable: true },
            { id: randomUUID(), name: 'Garlic Naan',          priceDelta: 400, isAvailable: true },
          ],
        }],
      }),
      base({
        name: 'Lamb Rogan Josh',
        description: 'Slow-cooked lamb in a bold Kashmiri sauce with whole spices, dried red chillies and caramelised onions.',
        price: 2000,
        categoryIds: [cat('Curries')],
        images: [
          img('1603894584373-5ac82b2ae398', 'Lamb rogan josh with garnish'),
          img('1606491956689-2ea866880c84', 'Rich curry sauce'),
        ],
        specialInfo: [
          { name: 'Spicy', icon: 'Flame' },
        ],
        variantGroups: [{
          id: randomUUID(), name: 'Spice Level',
          options: [
            { id: randomUUID(), name: 'Medium',        priceDelta: 0, isAvailable: true },
            { id: randomUUID(), name: 'Hot 🌶️',        priceDelta: 0, isAvailable: true },
            { id: randomUUID(), name: 'Extra Hot 🌶️🌶️', priceDelta: 0, isAvailable: true },
          ],
        }],
        addonGroups: [{
          id: randomUUID(), name: 'Serve With', minSelectable: 0, maxSelectable: 1,
          options: [
            { id: randomUUID(), name: 'Steamed Basmati Rice', priceDelta: 300, isAvailable: true },
            { id: randomUUID(), name: 'Garlic Naan',          priceDelta: 400, isAvailable: true },
          ],
        }],
      }),
      base({
        name: 'Garlic Naan',
        description: 'Freshly baked in our tandoor oven. Brushed with garlic butter and coriander.',
        price: 400,
        categoryIds: [cat('Breads & Rice')],
        images: [
          img('1596797038530-2c107229654b', 'Garlic naan with butter'),
        ],
        specialInfo: [
          { name: 'Contains Gluten', icon: 'Wheat' },
          { name: 'Contains Dairy', icon: 'Droplets' },
          { name: 'Vegetarian', icon: 'Utensils' },
        ],
        variantGroups: [{
          id: randomUUID(), name: 'Quantity',
          options: [
            { id: randomUUID(), name: '1 piece',  priceDelta: 0,   isAvailable: true },
            { id: randomUUID(), name: '2 pieces',  priceDelta: 350, isAvailable: true },
            { id: randomUUID(), name: '3 pieces',  priceDelta: 650, isAvailable: true },
          ],
        }],
      }),
      base({
        name: 'Gulab Jamun',
        description: 'Soft milk-solid dumplings soaked in a rose and cardamom sugar syrup. Served warm with a scoop of kulfi.',
        price: 700,
        categoryIds: [cat('Desserts')],
        images: [
          img('1601979031925-424e53b6caaa', 'Gulab jamun in syrup'),
        ],
        specialInfo: [
          { name: 'Contains Dairy', icon: 'Droplets' },
          { name: 'Contains Gluten', icon: 'Wheat' },
          { name: 'Vegetarian', icon: 'Utensils' },
        ],
        variantGroups: [{
          id: randomUUID(), name: 'Serve',
          options: [
            { id: randomUUID(), name: 'With Kulfi Ice Cream', priceDelta: 200, isAvailable: true },
            { id: randomUUID(), name: 'On its own',            priceDelta: 0,   isAvailable: true },
          ],
        }],
      }),
    ];
  }

  return [];
}

// ── 8. Seed a Basic subscription and usage doc per shop ───────────────────────
async function seedSubscriptionsAndUsage(shops: any[]): Promise<void> {
  console.log('\n💳 Creating subscriptions and usage...');

  for (const shop of shops) {
    const ts = now();
    await upsertSubscription({
      id: shop.id,
      shopId: shop.id,
      planId: 'plan-basic',
      status: 'free',
      billingInterval: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      billingCustomerId: null,
      billingSubscriptionId: null,
      cancelAtPeriodEnd: false,
      planSource: 'default',
      overriddenBy: null,
      overrideReason: null,
      overrideExpiresAt: null,
      createdAt: ts,
      updatedAt: ts,
    });
    await upsertUsage({
      id: shop.id,
      shopId: shop.id,
      periodKey: periodKeyFor(new Date(), shop.timezone),
      acceptedOrderCount: 0,
      lastReconciled: null,
      createdAt: ts,
      updatedAt: ts,
    });
  }
  console.log(`   ✓ ${shops.length} subscription(s) and usage doc(s)`);
}

// ── 9. Seed a manager and a staff login on Pizzeria Kreuzberg ────────────────
// Only runs when SEED_STAFF_PASSWORD is set, since a demo password should
// never be baked into the repo — it's supplied at seed time from the vault.
async function seedStaff(shops: any[]): Promise<void> {
  const password = process.env.SEED_STAFF_PASSWORD;
  if (!password) {
    console.warn('⚠️  SEED_STAFF_PASSWORD not set — no staff logins seeded');
    return;
  }

  const shop = shops.find((s) => s.key === 'Belconnen Pizza Palace'); // Pizzeria Kreuzberg
  if (!shop) {
    console.warn('⚠️  Pizzeria Kreuzberg not found — no staff logins seeded');
    return;
  }

  console.log('\n👤 Creating staff logins on Pizzeria Kreuzberg...');
  const passwordHash = await hashPassword(password);
  const staffDefs: Array<{ username: string; role: 'manager' | 'staff' }> = [
    { username: 'manager', role: 'manager' },
    { username: 'kitchen', role: 'staff' },
  ];
  for (const def of staffDefs) {
    const ts = now();
    await createStaffAccount({
      id: randomUUID(),
      shopId: shop.id,
      username: def.username,
      displayName: null,
      role: def.role,
      passwordHash,
      isActive: true,
      isDeleted: false,
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: null,
      createdBy: 'seed',
      createdAt: ts,
      updatedAt: ts,
    });
    console.log(`   ✓ ${shop.name} → ${def.username} (${def.role})`);
  }
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('🌱 Restaurant Ordering System — Seed Script');
  console.log('=========================================');

  await deleteAll();
  await seedPlans();
  const shops = await seedShops();
  const categoryMap = await seedCategories(shops);
  await seedProducts(shops, categoryMap);
  await seedSubscriptionsAndUsage(shops);
  await seedStaff(shops);

  console.log('\n✅ Seed complete!');
  console.log(`   ${shops.length} shops`);
  console.log(`   ${shops.length * 3} categories`);
  console.log(`   ${shops.length * 4} products`);
  console.log(`   ${PLAN_DEFS.length} plans`);
  console.log('\n📋 Shop slugs:');
  shops.forEach((s: any) => console.log(`   • ${s.slug}`));
}

main().catch((err) => {
  console.error('\n❌ Seed failed:', err);
  process.exit(1);
});
