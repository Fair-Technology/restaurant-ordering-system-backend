import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// One-off (2026-11-24): the 21 Ma Pasta `Pasta`-category dishes each carried their own inline copy of the pasta
// variant group, "Teigsorte" and the extras group. This moves them into three shop-wide library groups
// (`option_groups`, see SPECS "Shop-level option-group library") and points each dish at them via `optionGroupRefs`.
// Salads and lasagne are untouched. The library groups are built from the live dish data (options, prices,
// translations), not reinvented; only the group-level `nameTranslations` is pinned below, because it was missing on
// most dishes' copy of the pasta group.
// Live dishes call the groups "Deine Pasta"/"Deine Extras"; the seed file says "Ihre …". Both spellings are matched.
// Dry run by default; pass --apply to write. Safe to run twice: existing library groups are reused and dishes that
// already carry the refs and no inline copies are skipped.
//   npx ts-node --transpile-only scripts/menus/migrateMaPastaOptionGroups.ts [--apply]

const settingsPath = path.join(__dirname, '..', '..', 'local.settings.json');
if (fs.existsSync(settingsPath)) {
  const raw = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  for (const [k, v] of Object.entries(raw.Values ?? {})) if (process.env[k] === undefined) process.env[k] = v as string;
}

/* eslint-disable @typescript-eslint/no-var-requires */
const { findShopBySlug } = require('../../src/infrastructure/cosmos/shop/CosmosShopRepository');
const { findCategoriesByShopId } = require('../../src/infrastructure/cosmos/category/CosmosCategoryRepository');
const { findProductsByShopId, updateProduct } = require('../../src/infrastructure/cosmos/product/CosmosProductRepository');
const {
  findShopOptionGroupsByShopId,
  createShopOptionGroup,
} = require('../../src/infrastructure/cosmos/optionGroup/CosmosShopOptionGroupRepository');
/* eslint-enable @typescript-eslint/no-var-requires */

const SLUG = 'ma-pasta';
const CATEGORY = 'Pasta';

interface Spec {
  kind: 'variant' | 'addon';
  name: string; // library group name
  aliases: string[]; // names the dish-side inline copies may carry
  nameTranslations: Record<string, string>;
}

const SPECS: Spec[] = [
  { kind: 'variant', name: 'Deine Pasta', aliases: ['Deine Pasta', 'Ihre Pasta'], nameTranslations: { en: 'Your Pasta' } },
  { kind: 'addon', name: 'Teigsorte', aliases: ['Teigsorte'], nameTranslations: { en: 'Dough Type' } },
  { kind: 'addon', name: 'Deine Extras', aliases: ['Deine Extras', 'Ihre Extras'], nameTranslations: { en: 'Your Extras' } },
];

const inlineKey = (s: Spec) => (s.kind === 'variant' ? 'variantGroups' : 'addonGroups') as 'variantGroups' | 'addonGroups';

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const host = new URL(process.env.COSMOS_DB_ENDPOINT ?? process.env.COSMOS_ENDPOINT ?? 'https://localhost').hostname;
  console.log(`${apply ? 'APPLYING to' : 'Dry run against'} ${host}\n`);

  const shop = await findShopBySlug(SLUG);
  if (!shop) {
    console.error(`Shop with slug "${SLUG}" not found`);
    process.exit(1);
  }
  console.log(`Shop: ${shop.name} (${shop.id})`);

  const [categories, allProducts, library] = await Promise.all([
    findCategoriesByShopId(shop.id),
    findProductsByShopId(shop.id),
    findShopOptionGroupsByShopId(shop.id),
  ]);
  const category = categories.find((c: any) => !c.isDeleted && c.name === CATEGORY);
  if (!category) {
    console.error(`Category "${CATEGORY}" not found`);
    process.exit(1);
  }
  const dishes = allProducts.filter((p: any) => !p.isDeleted && (p.categoryIds ?? []).includes(category.id));
  console.log(`Category: ${category.name} (${category.id}), ${dishes.length} dishes\n`);

  const now = new Date().toISOString();

  // 1+2+3: resolve the three library groups (reuse by name, else create from live dish data)
  const groupIds: string[] = [];
  for (const spec of SPECS) {
    const existing = library.find((g: any) => spec.aliases.includes(g.name) && g.kind === spec.kind);
    if (existing) {
      console.log(`library   ${spec.name}: already exists (${existing.id}), reusing`);
      groupIds.push(existing.id);
      continue;
    }
    const source = dishes
      .flatMap((p: any) => p[inlineKey(spec)] ?? [])
      .find((g: any) => spec.aliases.includes(g.name));
    if (!source) {
      console.error(`library   ${spec.name}: no inline copy on any dish and none in the library; cannot build it`);
      process.exit(1);
    }
    const id = crypto.randomUUID();
    const group = {
      id,
      shopId: shop.id,
      kind: spec.kind,
      name: spec.name,
      nameTranslations: spec.nameTranslations,
      minSelectable: spec.kind === 'addon' ? source.minSelectable : 1,
      maxSelectable: spec.kind === 'addon' ? source.maxSelectable : 1,
      options: source.options.map((o: any) => ({
        id: crypto.randomUUID(),
        name: o.name,
        ...(o.nameTranslations ? { nameTranslations: o.nameTranslations } : {}),
        priceDelta: o.priceDelta,
        isAvailable: o.isAvailable !== false,
        allergenIds: o.allergenIds ?? [],
        additiveIds: o.additiveIds ?? [],
      })),
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    };
    console.log(
      `library   ${spec.name}: ${apply ? 'CREATE' : 'would create'} ${id} [${spec.kind}] ` +
        `${group.minSelectable}-${group.maxSelectable}, ${group.options.length} options: ` +
        group.options.map((o: any) => `${o.name} +${(o.priceDelta / 100).toFixed(2)}`).join(', '),
    );
    if (apply) await createShopOptionGroup(group);
    groupIds.push(id);
  }
  console.log('');

  // 4: dishes
  let migrated = 0;
  let skipped = 0;
  for (const p of dishes) {
    const removed: string[] = [];
    const next = { ...p };
    for (const spec of SPECS) {
      const key = inlineKey(spec);
      const before: any[] = next[key] ?? [];
      const kept = before.filter((g) => !spec.aliases.includes(g.name));
      if (kept.length !== before.length) {
        removed.push(...before.filter((g) => spec.aliases.includes(g.name)).map((g) => g.name));
        next[key] = kept;
      }
    }
    const refsBefore: string[] = p.optionGroupRefs ?? [];
    const refs = [...new Set([...refsBefore, ...groupIds])];
    const added = refs.filter((r) => !refsBefore.includes(r));
    if (removed.length === 0 && added.length === 0) {
      skipped++;
      console.log(`dish      ${p.name}: already migrated, skipped`);
      continue;
    }
    next.optionGroupRefs = refs;
    const left = [...(next.variantGroups ?? []), ...(next.addonGroups ?? [])].map((g: any) => g.name);
    console.log(
      `dish      ${p.name}: removed inline [${removed.join(', ')}]; refs +${added.length} (now ${refs.length})` +
        (left.length ? `; other inline groups kept: [${left.join(', ')}]` : ''),
    );
    if (apply) await updateProduct({ ...next, updatedAt: now });
    migrated++;
  }

  console.log(`\n${apply ? 'Applied' : 'Dry run'}: ${migrated} dishes migrated, ${skipped} already done, of ${dishes.length}.`);
  if (!apply) console.log('Pass --apply to write.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
