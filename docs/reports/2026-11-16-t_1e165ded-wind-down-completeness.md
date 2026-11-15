# t_1e165ded: wind-down completeness — images, staff accounts, commercial records

- Branch: `kanban/t_1e165ded`, based on `origin/main` @ `86b8eec`
- Merge commit: `131fcc9` (merged into `main` and pushed)

## What this covers

The 90-day wind-down (SPECS §15 "Retention and erasure", §10; built in `t_da3a2757`) already
anonymised orders and hard-deleted the menu documents and the storefront. It left three things
behind; the owner settled the retention policy on 2026-11-16 and this slice implements it.

| Data class | Decision | Implemented |
|---|---|---|
| Menu, cover and logo **images** (Blob Storage) | **DELETE** | The shop's whole `shops/{shopId}/` prefix is swept in the `product-media` container. |
| **Staff accounts** (`staff_accounts`) | **DELETE** | Every row in the shop partition is hard-deleted, soft-deleted ones included. |
| Promotions, `shop_subscriptions`, `shop_usage` | **KEEP** | Untouched — the wind-down never reads or writes them. |
| `checkout_sessions` | No change | Left alone; self-cleans on the container's 3600-second TTL (verified below). |
| Shops with no `deletedAt` | Do not backfill | `isDueForWindDown` keeps failing safe for them. No code change. |

## Changes

| File | Change |
|---|---|
| `src/infrastructure/storage/blobStorageHelpers.ts` | `shopBlobPrefix(shopId)` → `shops/{shopId}/` (refuses a blank id; the trailing slash stops `shops/abc` matching `shops/abcde/…`); `deleteBlobsByPrefix(prefix)` lists the container by prefix and `deleteIfExists`es each, returning the count. |
| `src/infrastructure/cosmos/staff/CosmosStaffAccountRepository.ts` | `findAllStaffAccountIdsByShopId` (single-partition query, soft-deleted rows included) and `deleteStaffAccount` (hard delete by `item(id, shopId)`). |
| `src/application/shop/windDown/executeWindDownShops.ts` | Per due shop, after the menu: a blob sweep of the shop's prefix, then a hard delete of every staff row. `WindDownResult` gains `staffAccountsDeleted` and `imagesDeleted`. |
| `docs/specs.md` §15 | Records the retention decision per data class. |
| `test/application/shop/windDownShops.test.ts` | Images and staff asserted in AC2; AC5's log-line contract extended; three new tests (see below). |
| `test/functions/shopWindDown.test.ts` | Stub result and the route's 200 body carry the two new counters. |
| `test/infrastructure/deleteBlobsByPrefix.test.ts` | New: the real prefix helper and the real sweep. |

### Why a prefix sweep, not per-document URLs

Images live at `shops/{shopId}/products/{productId}/…` and `shops/{shopId}/branding/…` — the whole
`shops/{shopId}/` prefix belongs to that one shop and nothing else in the container. Sweeping the
prefix removes the cover and logo, every product image, **and** orphans whose document is already
gone (the exact leak the ticket described). Deleting from the documents would miss the orphans.

### Failure handling

The new steps follow the existing rule: a failure is counted and the **shop document is not
deleted**, so the next daily run retries. The steps already done are skipped on the retry (the
staff rows are gone, the blobs are gone), so the retry is cheap and idempotent. This also means a
persistent Blob Storage fault can hold a shop in place rather than delete its document and orphan
its images — the safe direction, but worth knowing.

## Verification

- `npx vitest run` for the three touched files: 33 passed.
- `npm test` (whole suite): **192 files, 1768 tests, all passed**.
- `npm run build` → exit 0; regenerated `src/swagger/swagger.json` is byte-identical
  (`git status` shows no swagger change). The new fields ride on the injected-clock route, which
  is `skip: true` in the generator, so the published spec is unchanged.
- New tests in `windDownShops.test.ts`:
  - an image-sweep failure is counted, leaves the shop for the next run, and is retried;
  - a staff-delete failure is counted and retried while the other rows still go;
  - the sweep is scoped to the shop id exactly (`shops/shop-1` never matches `shops/shop-1extra`).
- `deleteBlobsByPrefix.test.ts`: prefix shape, blank-id refusal, deletes each listed blob and
  reports the count, no-op when nothing matches.

### `checkout_sessions` TTL — verified, not assumed

`infra/main.bicep` (lines 154-155) sets `defaultTtl: c.name == 'checkout_sessions' ? -1 : null`:
TTL is enabled on that container (`-1` = each item's own `ttl` applies), and every checkout session
document sets `ttl: 3600` (COSMOS `CheckoutSession.ttl`). So unfinished checkouts self-clean after
one hour and the wind-down correctly leaves them alone.

## Not done

- **Not run against Azure or Cosmos.** All tests fake the repositories and Blob Storage. The
  prefix listing, the batch of `deleteIfExists` calls and the staff-partition query are unverified
  against a live service.
- **No production deploy.** The wind-down timer is already live on the dev Function App; merging
  this to `main` changes dev behaviour for shops wound down from here on. For shops already wound
  down under the old code their images and staff rows remain — the sweep only runs for shops still
  present at wind-down time, and there is no backfill (consistent with the "no backfill" decision).
