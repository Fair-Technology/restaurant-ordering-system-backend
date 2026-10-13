# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

`npm test` runs the whole vitest suite (~150 files, ~1,270 tests, a few seconds). There is no vitest config: vitest's defaults pick up every `*.test.ts`, and they live under `test/`, mirroring the source layers (`test/domain`, `test/application/<area>`, `test/infrastructure`, `test/swagger`, `test/scripts`; fixtures in `test/fixtures`). Run one file with `npx vitest run test/domain/<file>.test.ts`. Tests need no Azure, Cosmos, Stripe or `local.settings.json`.

CI (`.github/workflows/dev_restaurant-ordering-system-dev.yml`) runs `npm ci`, `npm run build` and `npm test` on every push to `dev`; the deploy job only runs if all three pass.

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

| Module | Function handlers | Application service | Domain | Infrastructure |
|---|---|---|---|---|
| Shops | [src/functions/shop/](src/functions/shop/) | [src/application/shop/](src/application/shop/) | [src/domain/shop/](src/domain/shop/) | [src/infrastructure/cosmos/shop/](src/infrastructure/cosmos/shop/) |
| Products | [src/functions/product/](src/functions/product/) | [src/application/product/](src/application/product/) | [src/domain/product/](src/domain/product/) | [src/infrastructure/cosmos/product/](src/infrastructure/cosmos/product/) |
| Categories | [src/functions/category/](src/functions/category/) | [src/application/category/](src/application/category/) | [src/domain/category/](src/domain/category/) | [src/infrastructure/cosmos/category/](src/infrastructure/cosmos/category/) |

All functions are registered in [src/index.ts](src/index.ts).

### Key conventions

- **Soft deletes**: entities have `isDeleted` flag; records are never hard-deleted
- **Auto-generated slugs**: Shop slugs are derived from the name and validated for uniqueness
- **Partition key**: Cosmos DB containers use `id` as the partition key
- **Image uploads**: Products use Azure Blob Storage SAS URLs (generate → upload from client → register URL)
- **Authentication**: Auth helpers exist in [src/infrastructure/auth/](src/infrastructure/auth/) but are not yet implemented (TODO)

### Infrastructure

- **Azure Cosmos DB** — NoSQL, SQL API; containers: `shops`, `products`, `categories`
- **Azure Blob Storage** — Product images; SAS-based upload pattern
- **Azure App Insights** — Configured in `host.json`

Local development settings (Cosmos endpoint, keys, storage account) are in `local.settings.json` (gitignored). CI/CD deploys to Azure via GitHub Actions on push to `dev` branch (see [.github/workflows/](/.github/workflows/)).

### Adding a new entity

1. Define types in `src/domain/<entity>/`
2. Create repository interface in `src/domain/<entity>/`
3. Implement Cosmos DB repository in `src/infrastructure/cosmos/<entity>/`
4. Create application service in `src/application/<entity>/`
5. Add function handlers in `src/functions/<entity>/`
6. Register handlers in `src/index.ts`
7. Add Swagger spec entries in `src/swagger/swaggerSpec.ts`

