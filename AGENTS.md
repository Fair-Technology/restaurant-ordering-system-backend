# AGENTS.md

Guidance for any coding agent (Hermes, Codex, Claude Code, …) working in this repository.
Loaded automatically from the repository root — keep it short, and keep it true.

## Commands

```bash
# Install dependencies
npm install

# Development (hot reload via nodemon + concurrently)
npm run dev

# Build TypeScript to dist/
npm run build

# Run tests
npm test

# Start locally (build + run on port 7071)
npm start

# Start from pre-built dist (port 7073)
npm run start:dist
```

The local Azure Functions API is available at `http://localhost:7071/api/`.
Swagger UI: `http://localhost:7071/api/swagger`
Swagger JSON: `http://localhost:7071/api/swagger.json`

## Tests

`npm test` runs the whole vitest suite (161 files, ~1,470 tests, a few seconds). There is no vitest config: vitest's defaults pick up every `*.test.ts`, and they live under `test/`, mirroring the source layers (`test/domain`, `test/application/<area>`, `test/infrastructure`, `test/swagger`, `test/scripts`; fixtures in `test/fixtures`). Run one file with `npx vitest run test/domain/<file>.test.ts`. Tests need no Azure, Cosmos, Stripe or `local.settings.json`.

CI is [.github/workflows/main_restaurant-ordering-system.yml](.github/workflows/main_restaurant-ordering-system.yml) ("Build, test and deploy (dev)"): on every push to `main` and every pull request to `main` it runs `npm ci` → `npm run build` → `npm test`, and the "Deploy to dev" job only runs if that job passes.

Production promotion is a **separate** workflow that ships the same artifact the dev run built — [.github/workflows/promote.yml](.github/workflows/promote.yml), by manual dispatch or a `v*` tag. It cannot authenticate yet: see [docs/platform-identity.md](docs/platform-identity.md) for the deployment identity and the credential it still needs.

No linter is configured. Prettier is used for formatting (`.prettierrc`: single quotes, trailing commas, semicolons).

## Architecture

This is an **Azure Functions v4 (Node.js/TypeScript)** serverless backend. It follows a strict 4-layer architecture:

```
src/functions/      → HTTP triggers (controllers)
src/application/    → Business logic / use cases
src/domain/         → Entity types + repository interfaces
src/infrastructure/ → Cosmos DB + Blob Storage implementations
```

**Data flow:** `HTTP Request → Function Handler → Application Service → Repository → Cosmos DB → Response`

**Result pattern:** All application services return `ApplicationResult<T>` (discriminated union in [src/application/_shared/](src/application/_shared/)):
- Success: `{ ok: true, data: T }`
- Error: `{ ok: false, code: string, error: string }` — codes include `INVALID_INPUT`, `NOT_FOUND`, `FORBIDDEN`, etc.

The shared `mapResultToHttp()` helper in [src/functions/_shared/](src/functions/_shared/) converts `ApplicationResult` to HTTP responses.

### Modules

The table below is **illustrative, not exhaustive** — the product has grown well past these three; browse [src/functions/](src/functions/) for the full set (order, usage, invoice, staff, promotion, platform, reference, subscription, …).

| Module | Function handlers | Application service | Domain | Infrastructure |
|---|---|---|---|---|
| Shops | [src/functions/shop/](src/functions/shop/) | [src/application/shop/](src/application/shop/) | [src/domain/shop/](src/domain/shop/) | [src/infrastructure/cosmos/shop/](src/infrastructure/cosmos/shop/) |
| Products | [src/functions/product/](src/functions/product/) | [src/application/product/](src/application/product/) | [src/domain/product/](src/domain/product/) | [src/infrastructure/cosmos/product/](src/infrastructure/cosmos/product/) |
| Categories | [src/functions/category/](src/functions/category/) | [src/application/category/](src/application/category/) | [src/domain/category/](src/domain/category/) | [src/infrastructure/cosmos/category/](src/infrastructure/cosmos/category/) |

All functions are registered in [src/index.ts](src/index.ts).

### Key conventions

- **Soft deletes**: entities have `isDeleted` flag; records are never hard-deleted
- **Auto-generated slugs**: Shop slugs are derived from the name and validated for uniqueness
- **Partition key**: Cosmos DB containers use `/id` — point reads are `.item(id, id)`, *not* `.item(id, shopId)`
- **Image uploads**: Products use Azure Blob Storage SAS URLs (generate → upload from client → register URL)
- **Authentication**: **implemented.** Platform-staff access is an Entra app role in the workforce tenant rather than a database flag — see [docs/platform-identity.md](docs/platform-identity.md). The legacy CIAM `systemRole: 'superadmin'` path is still honoured, for migration only.
- **Payments**: card only, as Stripe Connect **direct charges** on the restaurant's own account with **manual capture** — money is reserved at checkout and captured when the restaurant accepts, so an order does not exist until Stripe confirms the reservation. See [docs/spec.md](docs/spec.md) §8.

### Infrastructure

- **Azure Cosmos DB** — NoSQL, SQL API. Containers: `shops`, `products`, `categories`, `orders`, `checkout_sessions`, `invoices`, `users`, `plans`, `plan_pricing`, `shop_subscriptions`, `shop_usage`, `auditLogs`, `staff_accounts`.
- **Azure Blob Storage** — product media, plus the Functions host's own state. The host transacts with it continuously, so an idle environment is not a free one.
- **Azure App Insights** — configured in `host.json`

Local development settings (Cosmos endpoint, keys, storage account) are in `local.settings.json` (gitignored). The local API writes to the **shared dev Cosmos database**, so a local run is not isolated from the deployed dev app.

### Adding a new entity

1. Define types in `src/domain/<entity>/`
2. Create repository interface in `src/domain/<entity>/`
3. Implement Cosmos DB repository in `src/infrastructure/cosmos/<entity>/`
4. Create application service in `src/application/<entity>/`
5. Add function handlers in `src/functions/<entity>/`
6. Register handlers in `src/index.ts`
7. Add Swagger spec entries in `src/swagger/swaggerSpec.ts`

## Where documentation lives

- **Durable, project-specific decisions → `docs/` in this repo**, committed, and citable from code. That is the established pattern: the product spec is [docs/spec.md](docs/spec.md) (code cites it as `SPECS §…`), with [docs/platform-identity.md](docs/platform-identity.md), [docs/deferred.md](docs/deferred.md), [docs/audit-2026-08-27.md](docs/audit-2026-08-27.md) and the `legal/` and `privacy/` packs beside it. The three frontends' READMEs point here.
- **Never commit**: local settings, keys, investigation logs, handoffs or session notes. A decision a teammate cannot read is not yet recorded — but a scratch file sitting beside the code is one `git add -A` away from publishing whatever is in it.
- **Cross-product decisions** (release-pipeline shape, conventions shared with the copyshop and invoice products) belong with code the team reads, not in a personal note. If it concerns several repos, put it in the hub repo's `docs/` and link to it rather than duplicating it.
