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

## Two things to know

**Do not deploy this to the existing dev resource group.** Dev's App Service
Plan was created by the CLI and carries an auto-generated name; the template
uses a deliberate one, so a deployment would leave a second, empty plan behind.
Dev is already correct — the template is for new environments.

**The EU regions are a requirement, not a preference.** The platform holds
diners' personal data as a processor for restaurants in Germany, and Australia
has no EU adequacy decision. Do not move these resources to an Australian
region.
