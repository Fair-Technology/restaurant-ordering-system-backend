# Production runbook

How to stand up the **production** environment of the restaurant-ordering platform,
top to bottom, with the exact commands in the order they must run.

**Status: prod is parked.** Nothing in this document has been executed. It was written
on 2026-11-10 by reading the live dev stack and the two sibling products that already
run a prod (copyshop and the invoice generator). Every value that could be checked
read-only was checked on that date; the checks are listed in [§13](#13-what-was-verified-when-this-was-written).

Read §0–§2 completely before running anything. §2 contains three **gates**: issues
that will stop prod from working if you go past them without resolving them.

---

## Contents

0. [What you are building](#0-what-you-are-building)
1. [Settled decisions (do not re-open while executing)](#1-settled-decisions)
2. [Gates — resolve before you start](#2-gates--resolve-before-you-start)
3. [Prerequisites](#3-prerequisites)
4. [Phase A — Azure resources](#4-phase-a--azure-resources)
5. [Phase B — Identity and GitHub](#5-phase-b--identity-and-github)
6. [Phase C — Authentication (Entra)](#6-phase-c--authentication-entra)
7. [Phase D — Stripe (live)](#7-phase-d--stripe-live)
8. [Phase E — Function App settings](#8-phase-e--function-app-settings)
9. [Phase F — First deploy](#9-phase-f--first-deploy)
10. [Phase G — Reference data (the empty database)](#10-phase-g--reference-data-the-empty-database)
11. [Backup policy](#11-backup-policy)
12. [Monitoring](#12-monitoring)
13. [What was verified when this was written](#13-what-was-verified-when-this-was-written)
14. [Rollback / teardown](#14-rollback--teardown)

---

## 0. What you are building

Prod mirrors dev one-for-one: the same nine resource types, the same SKUs. Two
things are deliberately different: the **region** and **hardening**, both described below.

| # | Resource | Name | Type / SKU | Region |
|---|---|---|---|---|
| 1 | Resource group | `rg-restaurant-ordering-system-prod` | — | germanywestcentral |
| 2 | Log Analytics workspace | `log-restaurant-ordering-system-prod` | PerGB2018, 30-day retention | germanywestcentral |
| 3 | Application Insights | `restaurant-ordering-system-prod` | workspace-based, `web` | germanywestcentral |
| 4 | Storage account | `restaurantordsysprod` | StorageV2, **Standard_LRS** | germanywestcentral |
| 5 | Cosmos DB account | `restaurant-ordering-system-db-prod` | NoSQL, **serverless**, Continuous 30-day backup | germanywestcentral |
| 6 | Flex Consumption plan | created by step A7 (auto-named, like dev's) | **FC1** | germanywestcentral |
| 7 | Function App | **`restaurant-ordering-system`** | Linux, Node 22, 2048 MB | germanywestcentral |
| 8 | Managed identity | `restaurant-ordering-system-id-prod` | user-assigned | germanywestcentral |
| 9–11 | Static Web Apps | `restaurant-ordering-system-{storefront,admin,superadmin}-prod` | **Free** | westeurope |

Plus, outside the resource group: a GitHub `production` environment on four repos,
Entra app registrations, and Stripe live-mode configuration.

**Why the Function App has no `-prod` suffix.** `.github/workflows/promote.yml` already
deploys to `app-name: 'restaurant-ordering-system'`. That name was free on 2026-11-10
(`checknameavailability` → `nameAvailable: true`). `*.azurewebsites.net` names are
global, so check again before step A7.

**Why `infra/main.bicep` is not used.** The template names the app
`${prefix}-${env}` → `restaurant-ordering-system-prod`, which `promote.yml` does not
target, and its README warns that a redeploy wipes all app settings. The
explicit commands below are also what dev actually is: dev's plan was created by the CLI and
its deployment storage uses a connection string, not the identity the template
declares. Reconciling the template is a separate task; this runbook does not depend on it.

**Idle cost.** FC1 and serverless Cosmos bill per use, and the Free SWAs, the identity
and the plan cost nothing. **However, the three timers run in prod too**
(`orderTimers` every minute, `reconcileCheckouts` every 2 minutes,
`subscriptionTimers` hourly). In dev they keep the host warm and bill about
**$3.91/month** ($0.68 executions + $2.66 blob operations, October 2026), so budget
the same for an idle prod. That cost grows with the number of shops. Cosmos's free tier is
one account per subscription, so do not plan on it.

---

## 1. Settled decisions

These were decided before this runbook was written. Record them; do not re-open them
mid-execution.

| Decision | Value | Why |
|---|---|---|
| Shape | Mirror dev 1:1 | Two siblings already prove it: copyshop `rg-copyshop-system-dev`/`-prod` (identical nine-resource shape and SKUs) and the invoice generator (`invoice-generator-id-prod` + `oidc-msi-prod`). |
| Region | **Germany West Central** for compute, data and telemetry | A German product holding diners' personal data, as a processor for German restaurants. Copyshop's prod is already there. This also decides where backups live (§11). Dev stays in West Europe. |
| Static Web Apps | **West Europe** | SWA is not offered in Germany West Central (copyshop's prod SWAs are in westeurope for the same reason). SWAs serve only static bundles and hold no diner data. |
| Deploy identity | Its **own** `restaurant-ordering-system-id-prod` | Not a second credential on the dev identity: dev keeps least privilege. It carries an `environment:production` federated credential because `promote.yml` sets `environment: production` (its approval gate). |
| Function App name | `restaurant-ordering-system` | What `promote.yml` already targets. |
| Database | Starts **empty** | `scripts/seed.ts` is guarded by `assertSeedTargetIsDev` and wipes containers. It must never run against prod. Reference data has its own path (§10). |
| Stripe | Live keys; a **restricted `rk_live_` key**, never the account `sk_live_` key | Task #6. |
| Auth tenant | **Open: see Gate 3** | Surfaced here, not settled. |

**Expected failure, not a bug:** until Phase B is complete, any run of
`promote.yml` stops at **"Login to Azure"** with `AADSTS700213` (no federated
credential matches the `environment:production` subject). Once B2 exists, the error
becomes "resource not found" until A7 exists. After both, the workflow succeeds.

---

## 2. Gates — resolve before you start

### Gate 1 — The frontend `promote.yml` would ship dev's configuration to prod

All three frontend repos have a `promote.yml` that **downloads the bundle the dev
workflow built and uploads it unchanged**. Vite inlines every `VITE_*` value at build
time, and the dev build job runs under the GitHub `dev` environment. A promoted bundle
would therefore call the **dev API** with the **test Stripe publishable key** and dev's
MSAL client IDs, whatever you set on the production environment.

- Backend promotion is not affected (Function App settings are read at runtime).
- **Do not run any frontend `promote.yml` until this is fixed.** The smallest fix is a
  promote job that rebuilds the tagged commit under `environment: production`, so it
  uses that environment's `vars.VITE_*`. The alternative, which keeps "same bytes", is a
  runtime `config.json`, but that means code changes in all three apps. This is a
  workflow change in the frontend repos and is outside this runbook. Phase F only deploys the
  backend, and §9.3 says what to do about the frontends in the meantime.
- The storefront's `promote.yml` header also names a production SWA token
  `…_BRAVE_ISLAND_0650DB300`. **No SWA with that hostname exists** in the subscription
  (checked 2026-11-10), so that comment is stale. Use the tokens from step A6.

### Gate 2 — The restricted-key guard (task #6) must exist first

`src/infrastructure/stripe/stripeClient.ts` accepts any `STRIPE_SECRET_KEY`. As of
2026-11-10 there is **no** code guard rejecting `sk_live_`, and **no** list of the
permissions a restricted key needs. Task #6 produces both: it builds the `rk_test_` key
`restaurant-api-test`, derives the permissions from that key's request log, and adds the
guard. **Do not go live before task #6 has shipped.** §7.2 creates the `rk_live_` key with
exactly the permission set task #6 recorded, and adds a shell-level prefix check as a
second line of defence.

### Gate 3 — Open decision: is prod's customer-auth (CIAM) tenant shared with dev, or separate?

Shop owners and staff sign in through an Entra External ID (CIAM) tenant. Dev uses
`restaurantorderingdev.onmicrosoft.com` (resource in `rg-restaurant-ordering-auth`).
**This is not settled. Decide it before Phase C.**

| | A. Share the dev tenant | B. Separate prod tenant |
|---|---|---|
| Work | Register a new prod app in the existing tenant | Create a new External ID tenant, its user flow and branding, then register the app |
| Accounts | Real restaurant owners sit next to test accounts in a tenant named "*dev*" | Clean separation |
| Token crossover | Prevented only if prod gets **its own app registration** (a different `aud`) | Prevented by issuer as well |
| Blast radius | A dev-tenant mistake (a policy, a user-flow edit, a deleted app) hits prod sign-in | Isolated |
| Precedent | — | **Copyshop uses separate CIAM tenants** for dev and prod (different `ciamlogin.com` issuer hosts, checked 2026-11-10) |

Whichever is chosen, **prod must have its own app registration**, never dev's
`ENTRA_CLIENT_ID`. The API checks `iss` + `aud`, so a shared tenant *and* a shared
client ID would make every dev token valid against prod. Phase C gives the steps for both
branches.

---

## 3. Prerequisites

**People and access**

- Azure: Owner (or Contributor + User Access Administrator) on subscription
  `Fair Australia - Creditcard Subscription` (`c115d7d2-2778-4d1d-8ac8-e234f5a95f17`),
  tenant `8d4c1fdb-6961-456c-8e29-96e7d93f62c1`. Role assignment in B3 needs the
  second role.
- Entra: Application Administrator in the workforce tenant (`8d4c1fdb-…`), and in the
  CIAM tenant chosen at Gate 3.
- GitHub: admin on `Fair-Technology/restaurant-ordering-system-{backend,admin,storefront,superadmin}`
  (all four are **public**, so environment required reviewers are available on the free plan).
- Stripe: admin on the platform account **in live mode**, with **Connect activated for
  live** (platform profile, business details and Connect branding complete). The live
  account is the one whose sandbox is `acct_1UN2dWRFlC5ji3Y9` ("Restaurant ordering dev").

**Tools** (this machine has no Homebrew. CLIs live in `~/.local/bin`)

- `az` ≥ 2.92 (flags below were checked against 2.92.0). Do **not** rely on az
  *extensions*: installs fail in this machine's venv, so this runbook uses core commands
  and `az resource` / `az rest` instead of `application-insights` and `scheduled-query`.
- `gh` authenticated as an admin of the org; `jq`; `openssl`.
- Stripe CLI 1.55.8 (optional; every Stripe step also has a dashboard path).

**Secret hygiene (binding).** Never echo a key. Every `az … appsettings set` below ends
in `-o none`, because that command otherwise **prints every setting value**, secrets
included. Keep the shell's history off while running Phases D–E (`set +o history` in bash,
or `setopt HIST_IGNORE_SPACE` in zsh plus a leading space on each command).

**Shell variables.** Open one shell and keep it for the whole run:

```sh
az login --tenant 8d4c1fdb-6961-456c-8e29-96e7d93f62c1
az account set --subscription c115d7d2-2778-4d1d-8ac8-e234f5a95f17
az account show --query "{name:name,id:id,tenant:tenantId}" -o json   # must print the ids above

SUB=c115d7d2-2778-4d1d-8ac8-e234f5a95f17
TENANT=8d4c1fdb-6961-456c-8e29-96e7d93f62c1
LOC=germanywestcentral
SWA_LOC=westeurope
RG=rg-restaurant-ordering-system-prod
LAW=log-restaurant-ordering-system-prod
AI=restaurant-ordering-system-prod
ST=restaurantordsysprod
COSMOS=restaurant-ordering-system-db-prod
DB=restaurant-ordering-system-db
APP=restaurant-ordering-system
ID=restaurant-ordering-system-id-prod
REPO=Fair-Technology/restaurant-ordering-system-backend
ORG=Fair-Technology
```

---

## 4. Phase A — Azure resources

Order matters: telemetry → storage → data → front-ends (their hostnames feed CORS) →
the Function App.

### A1. Resource group

```sh
az group create -n $RG -l $LOC --tags product=restaurant-ordering env=prod -o none
```

### A2. Log Analytics workspace

Dev's App Insights uses an Azure-managed workspace (it lives in an auto-created group
`ai_restaurant-ordering-system-dev_…_managed`). Prod creates its workspace explicitly, in the same group and region,
as copyshop's prod does (`log-copyshop-api-prod`).

```sh
az monitor log-analytics workspace create -g $RG -n $LAW -l $LOC --retention-time 30 -o none
LAW_ID=$(az monitor log-analytics workspace show -g $RG -n $LAW --query id -o tsv)
```

### A3. Application Insights

`az monitor app-insights` needs an extension, so create the component through ARM:

```sh
az resource create -g $RG -n $AI --resource-type Microsoft.Insights/components \
  --api-version 2020-02-02 --is-full-object -o none --properties "{
    \"location\": \"$LOC\",
    \"kind\": \"web\",
    \"properties\": { \"Application_Type\": \"web\", \"WorkspaceResourceId\": \"$LAW_ID\" }
  }"
AI_CS=$(az resource show -g $RG -n $AI --resource-type Microsoft.Insights/components \
  --query properties.ConnectionString -o tsv)
```

### A4. Storage account

Holds shop logos, cover images and dish photos (container `product-media`, publicly
readable by exact URL, not listable), plus the Functions deployment package and timer
leases. Public blob access must be allowed at account level, as in dev.

```sh
az storage account create -g $RG -n $ST -l $LOC --sku Standard_LRS --kind StorageV2 \
  --min-tls-version TLS1_2 --https-only true --allow-blob-public-access true -o none

ST_KEY=$(az storage account keys list -g $RG -n $ST --query "[0].value" -o tsv)

az storage container create --account-name $ST --account-key "$ST_KEY" \
  -n product-media --public-access blob -o none

# Hardening that dev does not have (see §11): 30-day soft delete for blobs and containers
az storage account blob-service-properties update -g $RG -n $ST \
  --enable-delete-retention true --delete-retention-days 30 \
  --enable-container-delete-retention true --container-delete-retention-days 30 -o none
```

### A5. Cosmos DB (serverless) and its containers

```sh
az cosmosdb create -g $RG -n $COSMOS --kind GlobalDocumentDB \
  --locations regionName=$LOC failoverPriority=0 isZoneRedundant=False \
  --capabilities EnableServerless \
  --default-consistency-level Session \
  --backup-policy-type Continuous --continuous-tier Continuous30Days \
  --minimal-tls-version Tls12 \
  --enable-free-tier false -o none

az cosmosdb sql database create -g $RG -a $COSMOS -n $DB -o none
```

Fourteen containers, matching `infra/main.bicep` and the code's container names.
**Partition keys and unique keys cannot be changed after creation.** In particular, the
unique key on `invoices./number` is what keeps invoice numbers unique.

```sh
for spec in shops:/id products:/shopId categories:/shopId orders:/id users:/id \
            plans:/id plan_pricing:/id shop_subscriptions:/id shop_usage:/id \
            auditLogs:/id system_config:/id; do
  az cosmosdb sql container create -g $RG -a $COSMOS -d $DB \
    -n "${spec%%:*}" -p "${spec#*:}" -o none
done

# Checkout sessions expire by their own per-item ttl (3600 s); -1 enables that
az cosmosdb sql container create -g $RG -a $COSMOS -d $DB -n checkout_sessions -p /id --ttl -1 -o none

az cosmosdb sql container create -g $RG -a $COSMOS -d $DB -n staff_accounts -p /shopId \
  --unique-key-policy '{"uniqueKeys":[{"paths":["/username"]}]}' -o none

az cosmosdb sql container create -g $RG -a $COSMOS -d $DB -n invoices -p /shopId \
  --unique-key-policy '{"uniqueKeys":[{"paths":["/number"]}]}' -o none

# Verify: expect 14 rows
az cosmosdb sql container list -g $RG -a $COSMOS -d $DB \
  --query "[].{n:name,pk:resource.partitionKey.paths[0],uk:resource.uniqueKeyPolicy.uniqueKeys[0].paths[0],ttl:resource.defaultTtl}" -o table
```

Dev also has a fifteenth container, `items`. Nothing in `src/` references it, so prod
does not get one.

Lock the account against deletion, because deleting a Cosmos account is irreversible:

```sh
az lock create -n no-delete-cosmos --lock-type CanNotDelete -g $RG \
  --resource $COSMOS --resource-type Microsoft.DocumentDB/databaseAccounts -o none
```

### A6. Static Web Apps (Free) and their hostnames

```sh
for a in storefront admin superadmin; do
  az staticwebapp create -g $RG -n restaurant-ordering-system-$a-prod -l $SWA_LOC --sku Free -o none
done

STOREFRONT_HOST=$(az staticwebapp show -g $RG -n restaurant-ordering-system-storefront-prod --query defaultHostname -o tsv)
ADMIN_HOST=$(az staticwebapp show -g $RG -n restaurant-ordering-system-admin-prod --query defaultHostname -o tsv)
SUPERADMIN_HOST=$(az staticwebapp show -g $RG -n restaurant-ordering-system-superadmin-prod --query defaultHostname -o tsv)
echo "$STOREFRONT_HOST  $ADMIN_HOST  $SUPERADMIN_HOST"   # write these down
```

If custom domains are wanted, add them now (`az staticwebapp hostname set`). Every
later step that uses `*_HOST` must then use the custom domain instead, including Stripe's
Apple Pay / Google Pay domain registration, which is driven by `STOREFRONT_BASE_URL`.

Now allow browser uploads from the front-ends to storage (the admin uploads images
directly with a short-lived link). Dev also allows `http://localhost:5173`; **prod does not**.

```sh
az storage cors add --services b --account-name $ST --account-key "$ST_KEY" \
  --methods GET HEAD PUT OPTIONS \
  --origins "https://$STOREFRONT_HOST" "https://$ADMIN_HOST" "https://$SUPERADMIN_HOST" \
  --allowed-headers '*' --exposed-headers '*' --max-age 3600
```

### A7. Function App on Flex Consumption

This creates the FC1 plan, a deployment container, and the `AzureWebJobsStorage` and
`DEPLOYMENT_STORAGE_CONNECTION_STRING` settings, the same way dev was created.
(Flex Consumption is offered in germanywestcentral; Node 22 is supported there until
**2027-04-30**, after which move to 24.)

```sh
az functionapp create -g $RG -n $APP \
  --flexconsumption-location $LOC \
  --storage-account $ST \
  --runtime node --runtime-version 22 \
  --instance-memory 2048 \
  --deployment-storage-auth-type StorageAccountConnectionString \
  --disable-app-insights true \
  --https-only true -o none

az functionapp cors add -g $RG -n $APP \
  --allowed-origins "https://$STOREFRONT_HOST" "https://$ADMIN_HOST" "https://$SUPERADMIN_HOST" -o none
```

`--https-only true` is hardening that dev lacks (dev's `httpsOnly` is `false`; copyshop's prod is `true`).
The App Insights connection is set in Phase E, pointing at the component from A3.

---

## 5. Phase B — Identity and GitHub

### B1. The deploy identity

```sh
az identity create -g $RG -n $ID -l $LOC -o none
PROD_CLIENT_ID=$(az identity show -g $RG -n $ID --query clientId -o tsv)
PROD_PRINCIPAL_ID=$(az identity show -g $RG -n $ID --query principalId -o tsv)
```

### B2. Federated credentials for `environment:production`

**The repo uses GitHub's immutable OIDC subject format.** On 2026-11-10,
`gh api repos/$REPO/actions/oidc/customization/sub` returned
`use_immutable_subject: true` with prefix
`repo:Fair-Technology@175465322/restaurant-ordering-system-backend@1050545921`. The
token GitHub presents therefore carries the **immutable** subject. Dev's identity
registers both forms, so prod does the same:

```sh
az identity federated-credential create -g $RG --identity-name $ID \
  --name github-production-immutable \
  --issuer https://token.actions.githubusercontent.com \
  --subject "repo:Fair-Technology@175465322/restaurant-ordering-system-backend@1050545921:environment:production" \
  --audiences api://AzureADTokenExchange -o none

az identity federated-credential create -g $RG --identity-name $ID \
  --name github-production \
  --issuer https://token.actions.githubusercontent.com \
  --subject "repo:Fair-Technology/restaurant-ordering-system-backend:environment:production" \
  --audiences api://AzureADTokenExchange -o none
```

Do **not** add branch subjects (`ref:refs/heads/main`). Prod is reachable only through
the approval-gated environment.

### B3. Least-privilege role: Website Contributor on the prod app alone

```sh
az role assignment create --assignee-object-id $PROD_PRINCIPAL_ID \
  --assignee-principal-type ServicePrincipal --role "Website Contributor" \
  --scope "/subscriptions/$SUB/resourceGroups/$RG/providers/Microsoft.Web/sites/$APP" -o none
```

### B4. GitHub `production` environment (backend repo)

The environment carries a required reviewer and only accepts `v*` **tags**, because
`promote.yml` triggers on `push: tags: v*`.

```sh
REVIEWER_ID=$(gh api users/manish-ghimire --jq .id)     # 68095065 on 2026-11-10

gh api -X PUT repos/$REPO/environments/production --input - <<EOF
{ "wait_timer": 0,
  "reviewers": [ { "type": "User", "id": $REVIEWER_ID } ],
  "deployment_branch_policy": { "protected_branches": false, "custom_branch_policies": true } }
EOF
gh api -X POST repos/$REPO/environments/production/deployment-branch-policies -f name='v*' -f type=tag

# The workflow reads secrets.AZURE_CLIENT_ID. An environment secret overrides the repo
# secret of the same name, so prod uses its identity while dev keeps the repo-level one.
gh secret set AZURE_CLIENT_ID --env production -R $REPO --body "$PROD_CLIENT_ID"
# AZURE_TENANT_ID and AZURE_SUBSCRIPTION_ID are the same as dev; the repo secrets apply.

gh api repos/$REPO/environments/production --jq '{name, rules: [.protection_rules[].type]}'
```

With the tag-only policy, a manual "Run workflow" must select the **tag** as its ref, not `main`.

### B5. GitHub `production` environments on the three frontend repos

Create them now so the reviewer gate exists, but **do not promote until Gate 1 is fixed.**

```sh
for r in admin storefront superadmin; do
  FR=$ORG/restaurant-ordering-system-$r
  gh api -X PUT repos/$FR/environments/production --input - <<EOF
{ "wait_timer": 0,
  "reviewers": [ { "type": "User", "id": $REVIEWER_ID } ],
  "deployment_branch_policy": { "protected_branches": false, "custom_branch_policies": true } }
EOF
  gh api -X POST repos/$FR/environments/production/deployment-branch-policies -f name='v*' -f type=tag
  az staticwebapp secrets list -g $RG -n restaurant-ordering-system-$r-prod --query properties.apiKey -o tsv \
    | gh secret set AZURE_STATIC_WEB_APPS_API_TOKEN --env production -R $FR
done
```

(The token is piped straight into `gh` and never printed.)

---

## 6. Phase C — Authentication (Entra)

### C1. Workforce (superadmin console): separate prod app registrations

The platform console signs in through the workforce tenant (`8d4c1fdb-…`). Dev uses
`restaurant-ordering-api-workforce` (`9b3447d9-…`, 3 app roles, 1 scope, v2 tokens) and
`restaurant-ordering-superadmin-workforce` (`9f715dbb-…`, SPA). Prod gets **its own
pair**, so a dev operator token (`aud` = dev API) is not accepted by prod. This is the
same reasoning as Gate 3, applied to the workforce side.

```sh
DEV_API_APPID=9b3447d9-638f-4a12-badf-87596b3b40e3

# API app: copy dev's three app roles, giving each a fresh GUID
az ad app show --id $DEV_API_APPID --query appRoles -o json > /tmp/roles.dev.json
jq -c '.[]' /tmp/roles.dev.json | while read -r role; do
  echo "$role" | jq --arg id "$(uuidgen | tr A-Z a-z)" '.id = $id'
done | jq -s '.' > /tmp/roles.prod.json
jq -r '.[].value' /tmp/roles.prod.json      # expect Platform.Owner, Platform.Support, Platform.ReadOnly

PROD_API_APPID=$(az ad app create --display-name restaurant-ordering-api-workforce-prod \
  --sign-in-audience AzureADMyOrg --app-roles @/tmp/roles.prod.json --query appId -o tsv)
PROD_API_OBJID=$(az ad app show --id $PROD_API_APPID --query id -o tsv)
az ad app update --id $PROD_API_APPID --identifier-uris "api://$PROD_API_APPID"

# Scope access_as_user, and v2.0 tokens (the API rejects v1.0, see docs/platform-identity.md)
SCOPE_ID=$(uuidgen | tr A-Z a-z)
az rest --method PATCH --url "https://graph.microsoft.com/v1.0/applications/$PROD_API_OBJID" \
  --headers "Content-Type=application/json" --body "{
    \"api\": { \"requestedAccessTokenVersion\": 2,
      \"oauth2PermissionScopes\": [ { \"id\": \"$SCOPE_ID\", \"value\": \"access_as_user\", \"type\": \"User\",
        \"isEnabled\": true,
        \"adminConsentDisplayName\": \"Access the restaurant ordering platform API\",
        \"adminConsentDescription\": \"Lets the superadmin console call the platform API as the signed-in operator.\",
        \"userConsentDisplayName\": \"Access the restaurant ordering platform API\",
        \"userConsentDescription\": \"Lets the console call the platform API as you.\" } ] } }"
az rest --method GET --url "https://graph.microsoft.com/v1.0/applications/$PROD_API_OBJID?\$select=api" \
  --query api.requestedAccessTokenVersion -o tsv          # must print 2

# Service principal, with assignment required (an operator with no role gets no token)
PROD_API_SP=$(az ad sp create --id $PROD_API_APPID --query id -o tsv)
az ad sp update --id $PROD_API_SP --set appRoleAssignmentRequired=true

# SPA app for the prod superadmin site
PROD_SPA_APPID=$(az ad app create --display-name restaurant-ordering-superadmin-workforce-prod \
  --sign-in-audience AzureADMyOrg --query appId -o tsv)
PROD_SPA_OBJID=$(az ad app show --id $PROD_SPA_APPID --query id -o tsv)
az rest --method PATCH --url "https://graph.microsoft.com/v1.0/applications/$PROD_SPA_OBJID" \
  --headers "Content-Type=application/json" \
  --body "{\"spa\":{\"redirectUris\":[\"https://$SUPERADMIN_HOST\"]}}"
az ad app permission add --id $PROD_SPA_APPID --api $PROD_API_APPID --api-permissions $SCOPE_ID=Scope
az ad sp create --id $PROD_SPA_APPID -o none
az ad app permission admin-consent --id $PROD_SPA_APPID
```

Grant each operator `Platform.Owner` (or `Platform.Support`), exactly as in
`docs/platform-identity.md` → "Granting and revoking console access", using `$PROD_API_APPID`.
**Do not assign `Platform.ReadOnly`**: it is deliberately denied until the read/write split exists.

Record: `WORKFORCE_TENANT_ID=$TENANT`, `WORKFORCE_API_CLIENT_ID=$PROD_API_APPID`.

### C2. Customer auth (CIAM): follow the branch chosen at Gate 3

First, read dev's registration so prod can mirror it (the CIAM tenant is a different
directory, so sign in to it):

```sh
az login --tenant restaurantorderingdev.onmicrosoft.com --allow-no-subscriptions
az ad app list --query "[].{name:displayName,appId:appId,spa:spa.redirectUris,uris:identifierUris,ver:api.requestedAccessTokenVersion}" -o json
```

**Branch A (shared tenant).** In `restaurantorderingdev`, create a new app registration
`restaurant-ordering-prod` that mirrors dev's (same SPA platform, scopes and token
version), with the SPA redirect URI `https://$ADMIN_HOST`. Attach it to the same user
flow. Record:
`ENTRA_TENANT_NAME=restaurantorderingdev`, `ENTRA_TENANT_ID=<that tenant's id>`,
`ENTRA_CLIENT_ID=<the new prod app id>`.

**Branch B (separate tenant).** In the Entra admin center → *Manage tenants* → *Create* →
*External*, create the tenant in the Europe data location, inside `rg-restaurant-ordering-auth`
(it then appears there as `Microsoft.AzureActiveDirectory/ciamDirectories`). Recreate dev's
sign-up/sign-in user flow and branding, then register the app as in branch A. Record the
three `ENTRA_*` values for the new tenant.

Either way, set `requestedAccessTokenVersion` to **2** (check with the same `az rest GET`
as in C1), then sign back in to the workforce tenant before continuing:

```sh
az login --tenant $TENANT && az account set --subscription $SUB
```

### C3. Frontend build variables (for when Gate 1 is fixed)

Set these on each frontend repo's `production` environment (`gh variable set NAME --env production -R <repo> --body <value>`).
They are public values, not secrets.

| Repo | Variable | Prod value |
|---|---|---|
| storefront | `VITE_API_BASE_URL` | `https://restaurant-ordering-system.azurewebsites.net/api` |
| storefront | `VITE_STRIPE_PUBLIC_KEY` | the live publishable key `pk_live_…` (§7.1) |
| admin | `VITE_API_BASE_URL` | `https://restaurant-ordering-system.azurewebsites.net/api` |
| admin | `VITE_SHOP_BASE_URL` | `https://$STOREFRONT_HOST` |
| admin | `VITE_STRIPE_PUBLISHABLE_KEY` | `pk_live_…` |
| admin | `VITE_MSAL_CLIENT_ID` / `VITE_MSAL_TENANT_ID` / `VITE_MSAL_TENANT_NAME` / `VITE_MSAL_API_SCOPE` | from C2, shaped as the `dev` environment's values are |
| superadmin | `VITE_API_BASE_URL` | `https://restaurant-ordering-system.azurewebsites.net/api` |
| superadmin | `VITE_MSAL_AUTHORITY` | `https://login.microsoftonline.com/$TENANT` |
| superadmin | `VITE_MSAL_TENANT_ID` / `VITE_MSAL_TENANT_NAME` | shaped as the `dev` environment's values are |
| superadmin | `VITE_MSAL_CLIENT_ID` | `$PROD_SPA_APPID` |
| superadmin | `VITE_MSAL_API_SCOPE` | `api://$PROD_API_APPID/access_as_user` |

Compare each against `gh variable list --env dev -R <repo>`: every name dev has, prod must
have. An unmapped `VITE_*` silently becomes `undefined`.

---

## 7. Phase D — Stripe (live)

All in the **live** mode of the platform account. Payments are direct charges on each
restaurant's connected account (`capture_method: manual`; money is reserved at checkout and
taken on acceptance). Subscriptions are billed on the platform account.

### 7.1 Publishable key

Dashboard → Developers → API keys (live) → copy the `pk_live_…` key for C3. It is public.

### 7.2 Restricted secret key (Gate 2)

Dashboard → Developers → API keys → *Create restricted key*, named `restaurant-api-live`, with
**exactly** the permissions task #6 recorded for `restaurant-api-test`, and nothing more.
The key is shown once. Paste it into a shell variable without echoing it, and refuse anything
that is not a restricted live key:

```sh
read -rs STRIPE_KEY; echo
case "$STRIPE_KEY" in
  rk_live_*) echo "ok: restricted live key" ;;
  *)         echo "REFUSING: not an rk_live_ key"; unset STRIPE_KEY ;;
esac
```

Never store it in `local.settings.json`, the Stripe CLI profile, or anything a local tool
reads. Its only homes are the Function App setting (Phase E) and your password vault.

### 7.3 Webhook endpoints (two)

Dashboard → Developers → Webhooks → *Add endpoint*, in live mode:

| Endpoint | Listen to | Events | Signing secret goes to |
|---|---|---|---|
| `https://restaurant-ordering-system.azurewebsites.net/api/webhooks/stripe-connect` | **Events on Connected accounts** | `payment_intent.amount_capturable_updated`, `payment_intent.succeeded`, `payment_intent.canceled`, `payment_intent.payment_failed`, `account.updated`, `charge.refunded`, `refund.failed`, `refund.updated`, `charge.refund.updated` | `STRIPE_CONNECT_WEBHOOK_SECRET` |
| `https://restaurant-ordering-system.azurewebsites.net/api/webhooks/stripe` | **Events on your account** | `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, `invoice.paid`, `invoice.payment_succeeded` | `STRIPE_WEBHOOK_SECRET` |

The Connect list is the nine events from `infra/README.md`. The account list is the cases
handled in `src/functions/order/stripeWebhook/index.ts`. Reveal each `whsec_…` and read it
into a variable the same way:

```sh
read -rs STRIPE_CONNECT_WHSEC; echo
read -rs STRIPE_WHSEC; echo
```

The two secrets are different, and mixing them up rejects every webhook with a signature
error. That is the bug class that already cost this project a day, and §12's alert exists
to catch it.

### 7.4 Subscription prices

For the paid plans, create live Products and Prices (EUR, recurring) matching what
dev seeds: **Pro** €29.00/month and €290.00/year, **Max** €59.00/month and €590.00/year.
Record the four `price_…` ids for §10. **Basic** is free and has no price.

### 7.5 Connect onboarding for real restaurants

Nothing to configure per restaurant up front. Each restaurant onboards from the admin
console (`createStripeAccountSession` → Stripe's embedded onboarding). Its live connected
account must reach charges-enabled before its shop can go live. `account.updated` (above)
keeps the shop's status current. Wallet domains (Apple Pay / Google Pay) are **not**
registered automatically with a restricted key: see §7.6.

### 7.6 Apple Pay / Google Pay cannot be registered with a restricted key

Do not try to fix this with a permission toggle. Stripe refuses the `paymentMethodDomains`
endpoints for restricted keys **by design**: *"the required permissions are not available for
use by restricted keys"*. No Connect or platform permission grant changes that.

- The code path is live: Connect onboarding → `registerStorefrontDomain`
  (`src/application/shop/_shared/registerStorefrontDomain.ts`) → `ensurePaymentMethodDomain`
  (`src/infrastructure/stripe/stripeClient.ts`).
- It is best effort (try/catch, then `console.warn`) and never blocks onboarding. On a
  restricted key it fails every time, and the log shows
  `[stripe:failure] op=register_payment_method_domain kind=permission_or_config ...`. That is expected.
- Effect: only wallet registration is lost. Cards, onboarding and the whole money path are unaffected.
- To get wallets, either register the domain per connected account in the Stripe Dashboard
  (payment method domain settings), or use an account (unrestricted) key for that one call, which
  this project has chosen not to hold. Both are product decisions, not bug fixes.

---

## 8. Phase E — Function App settings

Two calls: public settings, then secrets. Both end in `-o none` (see §3).

```sh
az functionapp config appsettings set -g $RG -n $APP -o none --settings \
  APPLICATIONINSIGHTS_CONNECTION_STRING="$AI_CS" \
  COSMOS_DB_ENDPOINT="https://$COSMOS.documents.azure.com:443/" \
  COSMOS_DB_DATABASE_ID=$DB \
  COSMOS_SHOP_CONTAINER=shops \
  COSMOS_PRODUCT_CONTAINER=products \
  COSMOS_CATEGORY_CONTAINER=categories \
  COSMOS_USERS_CONTAINER=users \
  COSMOS_PLANS_CONTAINER=plans \
  COSMOS_PLAN_PRICING_CONTAINER=plan_pricing \
  COSMOS_SUBSCRIPTIONS_CONTAINER=shop_subscriptions \
  COSMOS_USAGE_CONTAINER=shop_usage \
  COSMOS_CHECKOUT_SESSION_CONTAINER=checkout_sessions \
  STORAGE_ACCOUNT_NAME=$ST \
  ADMIN_APP_URL="https://$ADMIN_HOST" \
  STOREFRONT_BASE_URL="https://$STOREFRONT_HOST" \
  EMAIL_TRANSPORT=log \
  WORKFORCE_TENANT_ID=$TENANT \
  WORKFORCE_API_CLIENT_ID=$PROD_API_APPID \
  ENTRA_TENANT_NAME="<from C2>" ENTRA_TENANT_ID="<from C2>" ENTRA_CLIENT_ID="<from C2>"

az functionapp config appsettings set -g $RG -n $APP -o none --settings \
  COSMOS_DB_KEY="$(az cosmosdb keys list -g $RG -n $COSMOS --query primaryMasterKey -o tsv)" \
  STORAGE_ACCOUNT_KEY="$ST_KEY" \
  STAFF_JWT_SECRET="$(openssl rand -base64 48)" \
  STRIPE_SECRET_KEY="$STRIPE_KEY" \
  STRIPE_CONNECT_WEBHOOK_SECRET="$STRIPE_CONNECT_WHSEC" \
  STRIPE_WEBHOOK_SECRET="$STRIPE_WHSEC"

unset STRIPE_KEY STRIPE_CONNECT_WHSEC STRIPE_WHSEC ST_KEY
```

`STAFF_JWT_SECRET` is generated fresh and never leaves Azure. Changing it later signs out every
staff login. The other container names (`orders`, `invoices`, `auditLogs`, `system_config`,
`staff_accounts`) use the code's defaults, as in dev.

**Check the names, never the values.** Expect 29 names: dev's 28, plus `EMAIL_TRANSPORT`.

```sh
az functionapp config appsettings list -g $RG -n $APP --query "[].name" -o tsv | sort
diff <(az functionapp config appsettings list -g rg-restaurant-ordering-system-dev -n restaurant-ordering-system-dev --query "[].name" -o tsv | sort) \
     <(az functionapp config appsettings list -g $RG -n $APP --query "[].name" -o tsv | sort)
# expected diff: only "> EMAIL_TRANSPORT"
```

**Order and invoice emails.** Dev has no `ACS_*` settings, so in dev every order email and
invoice PDF is **only logged, never sent**. Prod as built here behaves the same way:
`EMAIL_TRANSPORT=log`. **Diners would receive no order confirmations and no invoices.** Before
go-live, decide whether to create an Azure Communication Services email resource (in the EU
data location) and set `EMAIL_TRANSPORT=acs`, `ACS_EMAIL_CONNECTION_STRING` and
`ACS_EMAIL_SENDER`, as described in `infra/README.md` → "Order emails and timer". This is a
go-live decision, not a mirror-of-dev item.

---

## 9. Phase F — First deploy

### 9.1 Backend

Promotion ships the exact artifact dev built and tested for the tagged commit, so the commit
must already have a **successful** run of `main_restaurant-ordering-system.yml`:

```sh
SHA=$(git rev-parse origin/main)
gh run list -R $REPO --workflow main_restaurant-ordering-system.yml --commit $SHA --status success --limit 1
git tag v0.1.0 $SHA && git push origin v0.1.0
gh run watch -R $REPO "$(gh run list -R $REPO --workflow promote.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
# The run waits for the production reviewer: approve it in the Actions UI.
```

Dev artifacts are kept for **90 days** (`retention-days: 90`), so a commit older than that
cannot be promoted. Push a fresh commit through dev first.

### 9.2 Smoke checks (read-only)

```sh
B=https://restaurant-ordering-system.azurewebsites.net/api
curl -s -o /dev/null -w "%{http_code}\n" $B/swagger.json            # 200
curl -s $B/swagger.json | jq '.paths | length'                      # equals dev's count
curl -s -o /dev/null -w "%{http_code}\n" $B/plans                   # 403: the app is up and refuses an anonymous caller
curl -s $B/reference-lists/DE | jq '{updatedBy, taxClasses: [.taxClasses[].id]}'
# {"updatedBy":null,"taxClasses":["food","beverage","delivery"]}: the in-code fallback, nothing stored yet
```

Then confirm the timers are firing on the prod host, using the ARM query route (no extension):

```sh
az rest --method POST \
  --url "https://management.azure.com/subscriptions/$SUB/resourceGroups/$RG/providers/Microsoft.Insights/components/$AI/query?api-version=2018-04-20" \
  --headers "Content-Type=application/json" \
  --body '{"query":"requests | where timestamp > ago(15m) | summarize n=count() by name, success"}'
# expect orderTimers (~1/min) and reconcileCheckouts (~1/2min), success=true
```

Finally, send a test event from the dashboard to each **live** webhook endpoint
("Send test webhook"). Each must return **2xx**. A 400 means the wrong signing secret.

### 9.3 Frontends

**Blocked by Gate 1.** Until the frontend promote workflows build with production
variables, the prod SWAs stay empty, and the API is reachable only through tools. Do not
work around this by pointing dev's frontends at the prod API.

---

## 10. Phase G — Reference data (the empty database)

Prod starts with **no** plans, pricing, legal identity or stored reference lists.
`scripts/seed.ts` **must not** be used: it wipes containers, and `assertSeedTargetIsDev` refuses
any host other than the dev account, which is correct. Instead, provision through the
**prod superadmin console**, signed in as an operator holding `Platform.Owner` (C1). Every
change then goes through the API's validation and is attributed to a named operator. If the
console is not deployed yet (Gate 1), the same calls can be made against the API routes listed
below with an operator bearer token.

Do this **before the first restaurant signs up**, in this order:

| # | What | Console page | API route | Why it must exist |
|---|---|---|---|---|
| 1 | **Basic** plan: `internalKey=free`, **default**, visible, sort 1, limits `ORDERS_PER_MONTH=30`, `STAFF_ACCOUNTS=5` | Plans → New | `POST /plans` | Shop creation attaches the default plan (`findDefaultPlan`). With none, a shop is given the fallback id `default-free`, which matches no plan document. |
| 2 | **Pro**: `internalKey=pro`, sort 2, `ORDERS_PER_MONTH=300`, `STAFF_ACCOUNTS=5` | Plans → New | `POST /plans` | |
| 3 | **Max**: `internalKey=max`, sort 3, `ORDERS_PER_MONTH=-1` (unlimited), `STAFF_ACCOUNTS=5` | Plans → New | `POST /plans` | |
| 4 | EUR pricing per plan: Basic 0/0; Pro 2900/29000; Max 5900/59000 (cents), with the live `price_…` ids from §7.4 for Pro and Max | Plans → *plan* → Pricing | `POST /plans/{planId}/pricing` | Subscription checkout reads the Stripe price id from here. |
| 5 | DE reference lists: 14 allergens, 13 additives, tax classes `food` (default), `beverage`, `delivery`, and their rates (food 7 %, beverage and delivery 19 %, all from 2026-01-01) | Reference lists → DE → **Save** | `PUT /platform/reference-lists/DE` | Without a stored document the API falls back to the in-code `DE_REFERENCE_LISTS`, so DE *works* empty. Saving once turns the rates into a stored, attributed record (`updatedBy`), so a future rate change is an edit, not a deploy. |
| 6 | Platform legal identity (the operator's company details) | Platform legal | `PUT /platform/legal-identity` | Read by the shop go-live check and by DPA acceptance. Restaurants cannot complete go-live without it. |
| 7 | Role permissions: review, keep defaults unless deliberately changed | Role permissions | `GET/PUT /platform/role-permissions` | |

The values above are dev's seed (`scripts/seed.ts` → `PLAN_DEFS`, and
`src/domain/reference/ReferenceLists.ts` → `DE_REFERENCE_LISTS`). Plans created through the API
get random UUIDs rather than dev's `plan-basic`/`plan-pro`/`plan-max`. Nothing in `src/` depends
on those ids (checked 2026-11-10).

Verify. `GET /plans` needs a signed-in caller, so check the plans in the console: three plans, exactly
one marked default. The reference lists are public:

```sh
curl -s https://restaurant-ordering-system.azurewebsites.net/api/reference-lists/DE | jq '{updatedBy, taxClasses: [.taxClasses[].id]}'
# updatedBy must now be an operator id, not null: the document is stored, not the fallback
```

---

## 11. Backup policy

| What | Policy | Recovery | Cost |
|---|---|---|---|
| **Cosmos DB** (all business data: shops, menus, orders, invoices, staff, audit) | **Continuous, 30-day** point-in-time restore (`Continuous30Days`), set at A5. Backups stay **in Germany West Central** with the account. | Restore to any second in the last 30 days, **into a new account** (Cosmos never restores in place). | Billed per GB of backup storage. Pennies at current volumes. |
| Cosmos account itself | `CanNotDelete` lock (A5) | — | free |
| Blob storage (images) | 30-day soft delete for blobs and containers (A4). LRS, in-region. | Undelete within 30 days | negligible |
| App Insights / Log Analytics | 30-day retention (A2) | — | per GB ingested |
| Config | App settings are not backed up by Azure. Their names are in §8, and the secret values live in the vault. | Re-run Phase E | — |

**Why continuous rather than periodic.** Copyshop's prod uses *periodic* backups (every 4 hours,
8-hour retention, geo-redundant), so it can lose up to four hours of orders and keeps only
eight hours of history. An ordering system with invoices cannot accept either. Continuous
30-day mode is what restaurant dev already runs.

**Why in-region.** Periodic geo-redundant storage would copy data to the paired region (Germany
North). That is still Germany, but continuous mode keeps everything in one region alongside the
live data, which keeps the data-residency statement simple: everything is in Germany West Central.

**Restore drill** (do it once after go-live, then quarterly; it creates a temporary account,
so delete it afterwards):

```sh
az cosmosdb restore -g $RG --account-name $COSMOS \
  --target-database-account-name ${COSMOS}-restore-test \
  --restore-timestamp "$(date -u -v-1H +%Y-%m-%dT%H:%M:%SZ)" \
  --location $LOC
# point a local, read-only check at it, count documents per container, then:
az cosmosdb delete -g $RG -n ${COSMOS}-restore-test --yes
```

(`date -v-1H` is the macOS form; on Linux use `date -u -d '1 hour ago' …`.)

**Backup is not archive. Open item.** German retention rules (e.g. §147 AO, §14b UStG) require
invoices and booking records to be kept for **years**, not 30 days. Neither PITR nor soft delete
meets that. Prod needs an archive path for invoices (and the PDFs they generate) before the
first real invoice is issued, and its retention period should be confirmed with the tax adviser.
This runbook does not design it.

---

## 12. Monitoring

Recreate dev's webhook alert (task #8 / B2) for prod. Without it, a wrong webhook
secret is **silent**: Stripe retries, orders never appear, and nothing tells you.

```sh
read -r ALERT_EMAIL     # who gets paged; not stored in this document

az monitor action-group create -g $RG -n ag-restaurant-prod-webhooks --short-name rsprodwh \
  --action email owner "$ALERT_EMAIL" -o none

AI_ID=/subscriptions/$SUB/resourceGroups/$RG/providers/Microsoft.Insights/components/$AI
AG_ID=/subscriptions/$SUB/resourceGroups/$RG/providers/microsoft.insights/actionGroups/ag-restaurant-prod-webhooks
U="https://management.azure.com/subscriptions/$SUB/resourceGroups/$RG/providers/Microsoft.Insights/scheduledQueryRules/alert-prod-webhook-non2xx?api-version=2023-03-15-preview"

az rest --method put --url "$U" --body "{
  \"location\": \"$LOC\",
  \"properties\": {
    \"displayName\": \"alert-prod-webhook-non2xx\",
    \"description\": \"Any non-2xx response to /api/webhooks/* on the prod Function App\",
    \"severity\": 1, \"enabled\": true,
    \"scopes\": [\"$AI_ID\"],
    \"evaluationFrequency\": \"PT5M\", \"windowSize\": \"PT5M\",
    \"criteria\": { \"allOf\": [ {
      \"query\": \"requests | where cloud_RoleName == '$APP' | where url has '/api/webhooks/' | where not(resultCode startswith '2')\",
      \"timeAggregation\": \"Count\", \"operator\": \"GreaterThan\", \"threshold\": 0,
      \"failingPeriods\": { \"numberOfEvaluationPeriods\": 1, \"minFailingPeriodsToAlert\": 1 } } ] },
    \"actions\": { \"actionGroups\": [\"$AG_ID\"] }
  } }"

az rest --method get --url "$U" --query "{enabled:properties.enabled,scope:properties.scopes[0]}"
```

`cloud_RoleName` must equal the app name, **`restaurant-ordering-system`**. Confirm it with
`requests | take 1 | project cloud_RoleName` once traffic exists. A wrong value means the alert
can never fire. Severity is 1 here (dev uses 2).

### Telling a Stripe permission failure from a declined card

Every failed Stripe call on the money paths (capture, release, refund, payment-intent creation)
and the wallet registration logs one line, before the order is rejected or the refund reported:

```
[stripe:failure] op=capture kind=permission_or_config type=StripePermissionError rawType=invalid_request_error code=more_permissions_required status=403 requestId=req_... orderId=...
```

`kind=permission_or_config` means the key or account cannot do this: fix the setup (the key's
Connect permissions), the diner did nothing wrong. `kind=card_decline` is a real decline (`declineCode`
says why). `kind=transient` is an outage and is retried. Search App Insights traces for `[stripe:failure]`.
A burst of `permission_or_config` after a key change means the new key is under-permissioned.

---

## 13. What was verified when this was written

All of these were read-only and run on 2026-11-10. Nothing was created.

| Check | Result |
|---|---|
| `az account show` | sub `c115d7d2-…`, tenant `8d4c1fdb-…` |
| Dev resources | 9 resource types as tabled in §0. Cosmos serverless, Continuous30Days, Session, West Europe, 15 containers (incl. unused `items`). FC1 plan. Node 22, 2048 MB. Deployment storage by connection string. `httpsOnly` false. Free SWAs. |
| Dev app setting **names** | the 28 listed in §8 (values not read, except public endpoint and container names) |
| Copyshop prod | Cosmos serverless + **periodic** 4 h / 8 h / Geo. Function App `httpsOnly` true. SWAs in westeurope. Separate CIAM tenant from copyshop dev. |
| Invoice generator prod | `invoice-generator-id-prod` and `oidc-msi-prod`, each with a federated credential for `ref:refs/heads/main`. `oidc-msi-prod` has Website Contributor on its RG. |
| Name availability | `restaurant-ordering-system` (sites): available. `restaurantordsysprod` (storage): available. `restaurant-ordering-system-db-prod` (Cosmos): not taken. |
| Flex Consumption | offered in germanywestcentral. Node 22 supported until 2027-04-30. |
| GitHub | backend has only a `dev` environment and no `production` one. Repo secrets `AZURE_CLIENT_ID/TENANT_ID/SUBSCRIPTION_ID`. OIDC `use_immutable_subject: true`. All four repos public. Org plan free. `promote.yml` has never run. |
| Workforce apps | `restaurant-ordering-api-workforce` (v2, 3 roles, 1 scope), `restaurant-ordering-superadmin-workforce` (SPA) |
| az CLI | every flag used above exists in az 2.92.0 (`--help` checked) |

**Not verified, because it would have required creating something or signing in elsewhere:** that the
commands succeed end to end; the CIAM registration details (a separate directory); the live
Stripe account and its Connect activation; the restricted-key permission list (task #6).
Before first use, dry-run the Azure parts in a throwaway group, e.g.
`rg-restaurant-ordering-system-rehearsal` with `-rehearsal` names, then delete that group.

---

## 14. Rollback / teardown

Before any real data exists, prod can be removed completely:

```sh
az lock delete -n no-delete-cosmos -g $RG --resource $COSMOS --resource-type Microsoft.DocumentDB/databaseAccounts
az group delete -n $RG --yes
gh api -X DELETE repos/$REPO/environments/production
for r in admin storefront superadmin; do gh api -X DELETE repos/$ORG/restaurant-ordering-system-$r/environments/production; done
az ad app delete --id $PROD_API_APPID; az ad app delete --id $PROD_SPA_APPID
```

Then disable the two live webhook endpoints and roll the live restricted key in the Stripe dashboard.

**After real data exists, do not tear down.** Deleting the Cosmos account destroys its continuous
backups with it. A bad deploy is rolled back by promoting the previous tag
(`gh workflow run promote.yml -R $REPO --ref v<previous>`), which reships that tag's artifact.
