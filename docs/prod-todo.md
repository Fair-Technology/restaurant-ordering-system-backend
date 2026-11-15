# Production todo — everything that is NOT dev

**Status: nothing in this file is dispatched.** These items were lifted off the
kanban board (board `restaurant-system`) on 2026-11-16 by owner decision: prod
and legal work does not belong in the working columns while the dev phase is
still running. They live here instead, with their old card ids, so nothing is
lost and any item can be cut back into a ticket when it is released.

Dev work stays on the kanban board. `docs/specs.md` stays the product law;
this file is the parking lot for work that needs a person, a payment, a
credential, or a lawyer.

When an item here is released, cut a fresh kanban card and delete the row.

---

## 1. Naming, domain, tenancy

| # | Item | Was card | Needs |
|---|---|---|---|
| 1.1 | **Name the product, buy the domain, create the production Entra tenant.** The prod Entra tenant, email domain, live Stripe checks and the Ma Pasta Shop button (slice 6) all wait on the product name + domain. The tenant must be created in the EU data location (it cannot be changed later), with `email` as optional claim on each app registration. | t_54b09033 | owner decision + domain purchase + Entra admin |
| 1.2 | **Decide the production customer-auth tenant: shared with dev or separate.** Gate 3: prod owners/staff sign in through an External ID tenant; dev uses `restaurantorderingdev.onmicrosoft.com`. Sharing is less work but mixes real owners with test accounts and shares blast radius; copyshop uses separate tenants. Either way prod needs its own app registration (own client id), v2.0 tokens, email optional claim. Blocks 1.1's output. | t_21117a33 | owner decision |

## 2. Production Azure

| # | Item | Was card | Needs |
|---|---|---|---|
| 2.1 | **Choose the canonical prod provisioning route: bicep or manual `az`.** `infra/main.bicep` is parameterised for prod (`main.prod.bicepparam`) while the runbook described the manual `az` route; running both collides on names. The template replaces the Function App's whole app-settings list, so it must not be re-run over a configured environment. Plan name and app-package container differ between the routes. | t_be414a11 | decision, then infra work |
| 2.2 | **Dry-run then deploy the production Azure environment.** Nothing for prod exists yet — what-if and create have never run. Rehearse in a throwaway resource group; check global name availability (`restaurant-ordering-system`, storage `restaurantordsysprod`, cosmos `restaurant-ordering-system-db-prod`); re-verify the immutable GitHub OIDC subject ids; check the host-storage-over-managed-identity path (timers may need queue/table roles — fall back to `AzureWebJobsStorage`). | t_f95c60ce | Azure subscription + spend |
| 2.3 | **Add production secrets and main-branch policy for promotion.** Promotion fails closed until the owner adds `AZURE_CLIENT_ID_PROD` (backend) and `AZURE_STATIC_WEB_APPS_API_TOKEN_PROD` (each frontend) as production environment secrets, the prod app and its `environment:production` federated credential exist, and the production environment accepts `main` as well as `v*` tags. | t_5eb7b090 | GitHub org admin |
| 2.4 | **Set the remaining production `VITE_*` variables on the three frontend repos.** The three promote jobs rebuild the released commit under `environment: production` and fail closed until every `VITE_*` is set and none still holds a dev value. Already set: `VITE_API_BASE_URL = https://restaurant-ordering-system.azurewebsites.net/api`. Still unset because each value depends on a decision or a resource that does not exist yet (admin needs the prod customer-auth app registration from 1.2; the rest follow 1.1 and 3.x). | t_b1455d8c | depends on 1.1, 1.2, 2.2 |
| 2.5 | **Backend production settings hardening — `STAFF_JWT_SECRET`.** Node 22 is already declared in `infra/main.bicep` (pre-existing, not new work). `STAFF_JWT_SECRET` appears nowhere in `infra/`; that is the real gap. Add it to the deployed prod app and document it in `infra/README.md`'s after-deployment step. All secrets in app settings / Key Vault, none in code. | t_ce0f609a | deployed prod app (2.2) |
| 2.6 | **Provision the `option_groups` Cosmos container in prod** before the option-group library is promoted. Already hand-provisioned in dev after a 500 on `GET /api/shops/{shopId}/catalog`; prod account `restaurant-ordering-system-db-prod` still lacks it, and the workflow only ships the Function App package, so the template never creates it. | t_59f70f1c | prod Cosmos (2.2) |
| 2.7 | **Configure real order email with an authenticated sending domain.** Prod defaults to `EMAIL_TRANSPORT=log`, so diners get no confirmations or invoices. Create the EU Azure Communication Services email resource; set `EMAIL_TRANSPORT=acs`, `ACS_EMAIL_CONNECTION_STRING`, `ACS_EMAIL_SENDER`, `PLATFORM_ALERT_EMAIL`; authenticate the sending domain with SPF, DKIM and DMARC. | t_96471f94 | ACS resource + DNS |
| 2.8 | **Provision production reference data via the superadmin console** before the first restaurant signs up: Basic/Pro/Max plans (30/300/unlimited orders, 5 staff), EUR pricing with live price ids, DE reference lists once (14 allergens, 13 additives, food 7%, beverage and delivery 19% from 2026-01-01), platform legal identity, review role permissions. Never run the dev seed. | t_0c6db27e | live env |

## 3. Live payments

| # | Item | Was card | Needs |
|---|---|---|---|
| 3.1 | **Set up the product's own live Stripe account and webhooks.** Only a test sandbox exists. Needs Connect activated in live mode, Legal Entity Sharing account, two live webhook endpoints (connected-account and platform events, distinct signing secrets) with the event lists, live Pro/Max EUR prices, and test-webhook 2xx checks. | t_2be6f9ee | Stripe live activation, business details |
| 3.2 | **Decide Apple Pay / Google Pay domain registration in production.** Restricted Stripe keys cannot register payment-method domains, so `registerStorefrontDomain` fails harmlessly and wallets are never registered. Decide: register per connected account in the Stripe dashboard, or hold an unrestricted key for that one call. | t_4cf39d1d | owner decision |

## 4. Legal, tax, privacy

| # | Item | Was card | Needs |
|---|---|---|---|
| 4.1 | **Appoint the EU representative (GDPR Art. 27) and get lawyer review of the DPA and legal packs.** Friend in Germany first: signed mandate, 48h forwarding, copy of the record of processing, warn them of their duties. Then one lawyer hour: DPA/AVV review, need for the representative, enforceability, Abmahnung exposure, allergy-field reasoning. **All platform wording stays draft until then.** | t_3e3a466a | person + lawyer |
| 4.2 | **Write the platform's own owner privacy policy and terms.** Owner accounts are the one thing the platform controls; this was deferred to slice 5a and is required before opening to restaurants. Mark as draft until 4.1. | t_a48b0e2d | 4.1 review |
| 4.3 | **Have a German tax adviser check correction invoices and the BMF 30% combo rule.** Check the Stornorechnung/Rechnungskorrektur layout once, and confirm whether the BMF 30% drinks simplification extends to a combo whose items each have a menu price. Until then it stays off by default and labelled. | t_069b55f1 | tax adviser |
| 4.4 | **Confirm the 8-year retention with a tax adviser, then lock the archive policy.** `records-archive` has an unlocked 2922-day time-based retention policy. Spec §10 says eight years since 2025. Locking is irreversible. | t_d9bdf156 | tax adviser |
| 4.5 | **Name a breach deputy and update the record of processing for the prod region.** The breach procedure still says "deputy: to be named". The record of processing names West Europe (Netherlands) but production is Germany West Central — update the record and sub-processor list in `src/domain/legal/platformDocuments.ts`, and re-publish the breach procedure + incident log template somewhere durable. | t_8cb30eca | named person |

## 5. Human-only acceptance checks (not prod, but no agent can run them)

These were on the board in `scheduled`/`blocked`. They need your hands: a typed
card number, your mailbox, or physical hardware.

| # | Item | Was card | Needs |
|---|---|---|---|
| 5.1 | **Paid-order browser checks for 8e (D1/D2, `POST comboChoices`) and 8c-2 D1.** The last browser checks from slices 8c-2 / 8e; everything else passed. Each needs a real Stripe card typed by you on deployed dev, with a freshly captured admin `storageState` in the same sitting. Not runnable headlessly. | t_1ed3674f (blocked) | you, live |
| 5.2 | **Run the two optional deployed live checks on dev.** (a) 8a D1 auto-accept-by-hours on a real card order — set "Only at these hours" outside the current window for the Ma Pasta dev shop, place a test-card order, expect PLACED (not auto-accepted); repeat inside the window, expect auto-accept. (b) 7a check 8 limit-warning email in the owner mailbox. Restore Ma Pasta's settings after. | t_fa971ce7 | you + real order |
| 5.3 | **Test the order alarm, wake-lock and escalation on a real kitchen tablet** (rs-admin, slice 5a): looping alarm, wake-lock, 3-minute escalation, auto-reject, including a dropped connection and installed-to-home-screen behaviour. | t_ab7db5d3 | a physical tablet |

---

## Releasing an item

1. Cut a kanban card on `restaurant-system` with the row's text as the body.
2. Delete the row here in the same commit.
3. If it changes product law, edit `docs/specs.md` in place first — this file
   is never the source of truth for what the product does.