# Infrastructure

`main.bicep` describes **one environment** of the restaurant-ordering platform:
Cosmos DB and its containers, the storage account, the Function App and its
plan, Application Insights, the deployment identity, and the three Static Web
Apps.

It was written by reading the dev environment that was built by hand on
2026-09-23, so deploying it with `env=dev` produces what is already there.

## Creating a new environment

```bash
az group create -n rg-restaurant-ordering-system-test -l westeurope
az deployment group create \
  -g rg-restaurant-ordering-system-test \
  -f infra/main.bicep \
  -p env=test
```

Production uses the same template with a parameter file:

```bash
az deployment group create -g rg-restaurant-ordering-system-prod \
  -f infra/main.bicep -p infra/main.prod.bicepparam
```

Names (Function App, storage, Cosmos), region and hardening are parameters; see
[docs/specs.md](../docs/specs.md) §20 for the values to confirm.

Then two things the template leaves out, and one it creates only when asked.

**1. Secret app settings.** Everything except the secrets is set by the
template. The rest comes from the vault `.env`, under the
`RESTAURANT_ORDERING_<ENV>_` prefix:

```bash
az functionapp config appsettings set \
  -g rg-restaurant-ordering-system-test -n restaurant-ordering-system-test \
  --settings COSMOS_DB_KEY=… STORAGE_ACCOUNT_KEY=… \
             ENTRA_TENANT_ID=… ENTRA_CLIENT_ID=… ENTRA_TENANT_NAME=… \
             STRIPE_SECRET_KEY=… STRIPE_WEBHOOK_SECRET=… \
             STRIPE_CONNECT_WEBHOOK_SECRET=… \
             STAFF_JWT_SECRET=… \
             VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… \
             VAPID_SUBJECT='mailto:…' \
             WEB_PUBSUB_CONNECTION_STRING=…
```

Vault keys for the last four: `RESTAURANT_ORDERING_<ENV>_VAPID_PUBLIC_KEY`,
`RESTAURANT_ORDERING_<ENV>_VAPID_PRIVATE_KEY`,
`RESTAURANT_ORDERING_<ENV>_VAPID_SUBJECT` and
`RESTAURANT_ORDERING_<ENV>_WEB_PUBSUB_CONNECTION_STRING`.

**The live order channel loses its settings quietly.** The kitchen board holds
a WebSocket to Web PubSub and receives Web Push on installed devices; both are
configured only by these app settings. If they are missing, `negotiate` answers
`{ "url": null, "accessToken": null }` and the board falls back to polling —
no error, no failed request, nothing in the logs. The board just stops updating
on its own. Check `GET /api/shops/{shopId}/realtime/negotiate` after any
deployment; a healthy channel returns a `wss://…/client/hubs/orders` URL.

- `WEB_PUBSUB_CONNECTION_STRING` — a fresh template deploy sets this itself
  from the resource's own key (`webPubSub.listKeys()` in `main.bicep`); it is
  listed here because dev is not redeployed from the template and because the
  value can always be re-read from Azure rather than regenerated:
  `az rest --method post --url "https://management.azure.com/subscriptions/<sub>/resourceGroups/rg-restaurant-ordering-system-<env>/providers/Microsoft.SignalRService/webPubSub/restaurant-ordering-system-wps-<env>/listKeys?api-version=2024-03-01"`.
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` — the template never
  sets these. The **private key cannot be regenerated without invalidating every
  browser push subscription already stored** (each one is bound to that key), so
  it must be in the vault `.env` *before* any template redeploy. The public key
  is derived from the private one (P-256, uncompressed point, base64url), so it
  is never a separate secret to keep. `VAPID_SUBJECT` is a `mailto:` address.

The template picks the Web PubSub tier by environment: `Free_F1` for dev (20
concurrent connections, 20 000 messages a day, $0) and `Standard_S1` otherwise.
A dev channel that outgrows those limits needs a paid tier — change the `sku`
line in `main.bicep`, or the board starts dropping its connection.

**2. The GitHub deployment credential — optional, the template can create it.**
Set `githubFederatedSubject` (the classic form, e.g.
`repo:Fair-Technology/restaurant-ordering-system-backend:environment:production`)
and/or `githubFederatedSubjectImmutable` (the immutable form, e.g.
`repo:Fair-Technology@175465322/restaurant-ordering-system-backend@1050545921:environment:production`)
and the deployment creates one federated credential per subject on the identity
*and* a *Website Contributor* role assignment scoped to the Function App (created
once, when either is set). This repo presents the **immutable** subject —
`gh api repos/<owner>/<repo>/actions/oidc/customization/sub` reports
`use_immutable_subject: true` — so a deployment pipeline needs the immutable one;
dev's identity carries both. Leave both `''` (the dev default) and what the
identity trusts has to be added separately — each subject names a specific repo
and environment, so it also has to be redone if a repo is ever renamed:

```bash
az identity federated-credential create --name github-test \
  --identity-name restaurant-ordering-system-id-test \
  -g rg-restaurant-ordering-system-test \
  --issuer https://token.actions.githubusercontent.com \
  --subject "repo:Fair-Technology/restaurant-ordering-system-backend:ref:refs/heads/test" \
  --audiences api://AzureADTokenExchange

az role assignment create --assignee-object-id <identityPrincipalId> \
  --assignee-principal-type ServicePrincipal --role "Website Contributor" \
  --scope "/subscriptions/<sub>/resourceGroups/rg-restaurant-ordering-system-test/providers/Microsoft.Web/sites/restaurant-ordering-system-test"
```

**3. Static Web App deployment tokens.** Each front-end repo needs
`AZURE_STATIC_WEB_APPS_API_TOKEN` set to its app's key:

```bash
az staticwebapp secrets list -g rg-restaurant-ordering-system-test \
  -n restaurant-ordering-system-admin-test --query properties.apiKey -o tsv
```

## Adding a container: container first, always

A container the code reads must exist in an environment **before** the code that
reads it is deployed there. Neither pipeline creates containers: the deploy
workflow ships the Function App package only, and dev is not redeployed from the
template (see "Two things to know" below), so a container added to `main.bicep`
arrives nowhere on its own.

Getting this wrong does not degrade gracefully. Code that treats a container as
*optional* still fails the whole request when the container is missing: dev had
no `option_groups`, and `GET /api/shops/{shopId}/catalog` answered
`500 Internal server error` for a live shop whose menu used no option groups at
all. The storefront is the read path diners hit first.

Release order for any change that adds a container:

1. **Merge the `main.bicep` change** so the shape of record is in `main`.
2. **Create the container in every live environment** from that shape — a
   template deploy where the environment *is* template-managed, a targeted
   creation where it is not (`<env>` = `dev`, and later `prod`):

   ```bash
   az cosmosdb sql container create \
     -g rg-restaurant-ordering-system-<env> \
     -a restaurant-ordering-system-db-<env> \
     -d restaurant-ordering-system-db \
     -n option_groups --partition-key-path "/shopId" --throughput 400
   ```

   Match the bicep line exactly: the `pk` path, `kind: 'Hash'`, the unique-key
   policy (omit it when `uniqueKeys` is empty), and `defaultTtl` — only
   `checkout_sessions` carries `-1`; everything else is left unset.
3. **Read it back** and check the partition key path, not just that the command
   exited 0:

   ```bash
   az cosmosdb sql container show \
     -g rg-restaurant-ordering-system-<env> \
     -a restaurant-ordering-system-db-<env> \
     -d restaurant-ordering-system-db -n option_groups \
     --query "resource.partitionKey.paths" -o tsv
   ```

4. **Then deploy the code**, and probe the read path that uses the container.
5. **Add the name to the container list in [AGENTS.md](../AGENTS.md)** so the
   next reader does not have to diff bicep against the live account.

## Order emails and timer

Order emails (received, accepted, ready, declined, cancelled, and the
restaurant's "order waiting" alert) and invoice PDFs go through one sender. The
template now creates the Email Communication Service, the domain and the
Communication Service, and sets `EMAIL_TRANSPORT`, `ACS_EMAIL_SENDER` and
`ACS_EMAIL_CONNECTION_STRING` itself via `listKeys()` — these three (plus
`STOREFRONT_BASE_URL`) are **no longer wiped** by a redeploy, unlike the
secrets in step 1. With `EMAIL_TRANSPORT=log`, emails are only written to the
log (kind and recipient count, never the contents).

Runbook, in order:

1. **Dev: nothing to do.** The next `main.bicep` deploy to dev creates the
   Azure-managed domain (auto-verified) and dev's `EMAIL_TRANSPORT` becomes
   `acs` automatically. **Check `STOREFRONT_BASE_URL`:** dev's hand-set value
   today is `https://salmon-mushroom-015326603.2.azurestaticapps.net`; the
   template overwrites it with the storefront Static Web App's own
   `defaultHostname`. After the deploy, confirm the computed value still
   resolves to the live storefront
   (`az staticwebapp show -g <rg> -n restaurant-ordering-system-storefront-dev --query defaultHostname`)
   and, if the live storefront is really a custom domain pointing elsewhere,
   update DNS / any external reference.
2. **Prod domain.** Name it: set `prodEmailDomainName` (empty/commented in
   `main.prod.bicepparam` today) and deploy. Then add the DNS records ACS gives
   you for that domain: a TXT ownership/verification record, an SPF TXT record
   and a DKIM CNAME pair (two records). Exact values come from
   `az communication email domain show` or the portal's "Verify domain" blade
   once the domain resource exists.
3. **Verify.** Run
   `az communication email domain show -g <rg> --email-service-name <name> --domain-name <domain> --query verificationStates`
   until every required record shows `Verified`. The template already links the
   domain to the Communication Service (`linkedDomains`), so once DNS verifies
   the existing link becomes usable — no further linking step.
4. **Switch on.** Only then set `enableAcsEmail = true` in
   `main.prod.bicepparam` and redeploy. Before that, prod keeps
   `EMAIL_TRANSPORT=log` even though the domain and connection string already
   exist — by design (see the comment on `enableAcsEmail` in the bicep).
5. **Raising the send limit** once live volume needs it: self-service is not
   available. Raise a support request against the Communication Service
   resource asking for a higher email sending limit, and quote the resource
   (`restaurant-ordering-system-acs-<env>`) in the ticket.
6. **Limits:**

   | Domain type | Per-minute | Per-hour | Raisable? |
   |---|---|---|---|
   | Azure-managed (dev) | 5 | 10 | No — fixed, cannot be raised |
   | Customer-managed, verified (prod) | 30 | 100 | Yes, via Azure support request |

The one-minute order timer (3-minute alert, auto-decline, auto-complete four
hours after the ready time) is a timer trigger, so it needs `AzureWebJobsStorage` on the
Function App. The dev app already has it.

**Warning: redeploying `main.bicep` still replaces the Function App's whole app
settings list, so every OTHER hand-set app setting is wiped.** Re-apply these
from the vault `.env` (step 1) straight after any deployment: `COSMOS_DB_KEY`,
`STORAGE_ACCOUNT_KEY`, `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`,
`ENTRA_TENANT_NAME`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`STRIPE_CONNECT_WEBHOOK_SECRET`, `STAFF_JWT_SECRET`, `VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. Their absence disables the live order
channel (VAPID) without any error. `WEB_PUBSUB_CONNECTION_STRING`, the email
settings and `STOREFRONT_BASE_URL` are template-managed and need no re-apply.

## Eight-year archive timer

The daily `archiveTimer` function (02:17 UTC) exports `orders` + `invoices` and
writes them to the private `records-archive` container (docs/specs.md §10, §20).
Without a `COSMOS_DB_KEY` it reads Cosmos as the deployment identity, which needs
the Cosmos data-plane **Built-in Data Reader** role on the app database — the
template creates that assignment (`identityCosmosRead`). Blob write comes from the
existing Storage Blob Data Owner assignment (`identityStorageAccess`).

## Card payments and invoices

Every order is paid by card. At checkout the diner's card is only **reserved**
(Stripe "manual capture"); the money is **taken when the restaurant accepts**
the order. If the restaurant declines, the diner cancels, or the order times
out, the reservation is released and the diner is never charged. With
auto-accept on (the default, per restaurant) the capture happens at once.

**Invoices.** An invoice is issued when an order is accepted (card orders
only), numbered `R-YYYY-NNNNN` with a counter per year, and emailed to the
diner as a PDF. A refund produces a correction invoice (`R-YYYY-NNNNN` too); if
the first refund covers the whole order it is a cancellation invoice
(Stornorechnung). The restaurant needs a VAT ID or a tax number (Legal page)
before it can go live, because an invoice needs one of the two.

**Two refund modes** (staff, on an accepted order):
- *Choose items*: each ticked item is refunded at its own VAT rate (a drink at
  19 %, food at 7 %), so the correction invoice is right per rate.
- *Enter an amount*: a goodwill refund not tied to an item; split across the
  rates in proportion to the order.

**Cosmos container.** Create it before the first deploy of the invoice code.
The unique key on `/number` cannot be added to an existing container later:

```
az cosmosdb sql container create -g rg-restaurant-ordering-system-dev -a restaurant-ordering-system-db-dev -d restaurant-ordering-system-db -n invoices -p /shopId --unique-key-policy '{"uniqueKeys":[{"paths":["/number"]}]}'
```

(`main.bicep` lists the same container for new environments. Do not redeploy
it to dev, see below.)

**App settings.** `STOREFRONT_BASE_URL` must be the public storefront address
(it also decides which domain is registered for Apple Pay / Google Pay on each
restaurant's Stripe account; localhost is skipped):

```
az functionapp config appsettings set -g rg-restaurant-ordering-system-dev -n restaurant-ordering-system-dev --settings STOREFRONT_BASE_URL=https://salmon-mushroom-015326603.2.azurestaticapps.net
```

**Stripe webhook.** The Connect endpoint `/api/webhooks/stripe-connect` must
send nine events: `payment_intent.amount_capturable_updated`,
`payment_intent.succeeded`, `payment_intent.canceled`,
`payment_intent.payment_failed`, `account.updated`, `charge.refunded`,
`refund.failed`, `refund.updated` and `charge.refund.updated`.
Refunds made in a restaurant's Stripe dashboard come in through `charge.refunded`
and are recorded as a free-amount refund; the correction invoice follows within a
minute from the order timer. A refund Stripe later fails or that is cancelled in
the dashboard comes in through `refund.failed` / `refund.updated`
(`charge.refund.updated` only fires for some payment methods). The order records a
reversal, and the timer issues a correction invoice reversing the earlier one. Its signing secret is
`STRIPE_CONNECT_WEBHOOK_SECRET`. Locally:

```sh
# --all-snapshot is required on CLI 1.55.8: a forward target without an event
# selection exits with "must specify events to forward".
stripe listen --forward-connect-to localhost:7071/api/webhooks/stripe-connect --all-snapshot
```

The CLI prints its signing secret on startup ("Your webhook signing secret is
whsec_…"). It must equal `STRIPE_CONNECT_WEBHOOK_SECRET` (and, for the
subscription endpoint, `STRIPE_WEBHOOK_SECRET`) in `local.settings.json`, or every
webhook is rejected with a signature error. The CLI's secret is stable across
restarts.

## Two things to know

**Do not deploy this to the existing dev resource group.** Dev's App Service
Plan was created by the CLI and carries an auto-generated name; the template
uses a deliberate one, so a deployment would leave a second, empty plan behind.
Dev is already correct — the template is for new environments.

**The EU regions are a requirement, not a preference.** The platform holds
diners' personal data as a processor for restaurants in Germany, and Australia
has no EU adequacy decision. Do not move these resources to an Australian
region.
