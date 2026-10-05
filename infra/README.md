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

Then three things the template deliberately leaves out.

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
             STAFF_JWT_SECRET=…
```

**2. The GitHub deployment credential.** The identity exists, but what it
trusts names a specific repo and branch, so it is added separately — and has to
be redone if a repo is ever renamed:

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

## Order emails and timer

Order emails (received, accepted, ready, declined, cancelled, and the
restaurant's "order waiting" alert) go through one sender. Until the Azure
email service exists, every email is only written to the log (kind and
recipient count, never the contents), so the order flow works without it.

App settings, all set by hand (the template does not create them):

| Setting | Meaning |
|---|---|
| `EMAIL_TRANSPORT` | `log` (default) or `acs`. `acs` is used only when the next two are also set. |
| `ACS_EMAIL_CONNECTION_STRING` | Secret. Vault key `RESTAURANT_ORDERING_DEV_ACS_EMAIL_CONNECTION_STRING`. |
| `ACS_EMAIL_SENDER` | The sender address of the Azure email domain. |
| `STOREFRONT_BASE_URL` | Base URL of the storefront; the order link in each email is built from it. |

The one-minute order timer (3-minute alert, auto-decline, auto-complete at
local midnight) is a timer trigger, so it needs `AzureWebJobsStorage` on the
Function App. The dev app already has it.

**Warning: redeploying `main.bicep` replaces the Function App's whole app
settings list.** Every hand-set secret and the settings above would be wiped.
Re-apply them from the vault `.env` straight after any deployment.

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
send five events: `payment_intent.amount_capturable_updated`,
`payment_intent.succeeded`, `payment_intent.canceled`,
`payment_intent.payment_failed` and `account.updated`. Its signing secret is
`STRIPE_CONNECT_WEBHOOK_SECRET`. Locally:

```
stripe listen --forward-connect-to localhost:7071/api/webhooks/stripe-connect
```

## Two things to know

**Do not deploy this to the existing dev resource group.** Dev's App Service
Plan was created by the CLI and carries an auto-generated name; the template
uses a deliberate one, so a deployment would leave a second, empty plan behind.
Dev is already correct — the template is for new environments.

**The EU regions are a requirement, not a preference.** The platform holds
diners' personal data as a processor for restaurants in Germany, and Australia
has no EU adequacy decision. Do not move these resources to an Australian
region.
