# D3 — Scheduled orders + invoices archive export

Packet D3 follow-up · repo `rs-backend` · 2026-11-15.

## What was built

- **`archiveTimer`** (`src/functions/archive/archiveTimer/index.ts`, registered in `src/index.ts`): a timer
  Function, daily at 02:17 UTC. It exports `orders` + `invoices` to a temp directory (one JSONL file per
  container + `manifest.json` with counts and SHA-256), uploads them to the private `records-archive`
  blob container under a per-run prefix derived from the manifest's `createdAt`
  (e.g. `2026-11-15T02-17-00Z/`), downloads them again and verifies every blob against the manifest.
  Any failure throws, so a bad run is a failed invocation, not a silent one.
- **`src/infrastructure/archive/`**: `archiveLib.ts` (moved unchanged from `scripts/backup/`, except that the
  per-file check is now the buffer-based `verifyArchiveEntry`, shared by `verifyArchive(dir)` and the blob
  verification — one checksum implementation); `archiveBlob.ts` (prefix, upload, verify, adapter over
  `@azure/storage-blob`); `archiveClients.ts` (Cosmos + blob clients from app settings: key or connection
  string when set, otherwise the Function App's identity via `@azure/identity`).
- **`scripts/backup/exportToArchive.ts`**: the same export → upload → verify, for manual runs and drills.
- **`infra/main.bicep`**: `identityCosmosRead` — Cosmos SQL role assignment giving the deployment identity
  *Cosmos DB Built-in Data Reader* on the app database. Blob write uses the existing Storage Blob Data
  Owner assignment (`identityStorageAccess`); no second blob role was added.
- Docs: `docs/specs.md` §10 and §20 "Backups", `infra/README.md`.

Why a Function timer and not a GitHub Actions cron: an unattended daily legal-archive job must not wait
behind the `production` environment's required-reviewer gate, and the Function App already carries the
right per-environment identity.

## What was verified

- `npm run build` passes; `az bicep build --file infra/main.bicep` compiles with no errors or warnings.
- `npm test`: 179 files, 1,672 tests, all green. New `test/infrastructure/archive/archiveBlob.test.ts`
  (in-memory blob container that refuses overwrites) covers: one blob per manifest file under one run
  prefix with bytes intact; a faithful upload verifies; one flipped byte fails the checksum, naming the
  blob; a missing blob is reported by name; a second run gets a different prefix and leaves the first
  run's blobs untouched. `test/scripts/backupArchive.test.ts` still passes against the moved library.

## What is NOT verified

- Nothing was deployed. The Cosmos role assignment has not been applied to any live account.
- The timer has never run against a real environment, and the `@azure/storage-blob` / `DefaultAzureCredential`
  paths have not been exercised against Azure or Azurite — only the in-memory fake.
- Whether a deployed run uses the identity or keys depends on app settings: the README's post-deploy step
  sets `COSMOS_DB_KEY` and `STORAGE_ACCOUNT_KEY`, and when those are present they are used in preference
  to the identity.

## Human actions required

1. Deploy `infra/main.bicep` to each environment so the Cosmos data-reader role assignment exists (and
   re-apply the hand-set app settings afterwards — a template deployment replaces them).
2. Confirm the eight-year period with the tax adviser, then lock the `records-archive` retention policy
   (irreversible).
3. Run the §11 Cosmos point-in-time restore drill against the live account.
4. After the first scheduled run, check the Function's log for the `[archive]` lines and the new prefix in
   `records-archive`.
