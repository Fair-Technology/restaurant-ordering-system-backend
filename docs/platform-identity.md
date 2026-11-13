# Platform identity

Who is allowed to use the platform (superadmin) API, and where that decision lives.

## The model

The API trusts **two token issuers**, and they mean different things:

| Issuer | Configured by | Signs in | Grants |
| --- | --- | --- | --- |
| Customer tenant (Entra External ID / CIAM) | `ENTRA_TENANT_NAME`, `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID` | shop owners and their staff | normal product access |
| Workforce tenant | `WORKFORCE_TENANT_ID`, `WORKFORCE_API_CLIENT_ID` | our own operators | the superadmin console |

Both are verified in `src/infrastructure/auth/trustedIssuers.ts`: signature, `iss`,
`aud` and expiry, against the matching key set. The workforce entry is optional — an
environment without those two settings simply accepts customer tokens, which is why
this was introduced without breaking anything.

`verifyEntraToken` reports **which** issuer vouched for a token, so authorisation can
depend on where an identity comes from rather than only who it is.

## App registrations

In the workforce tenant:

- **API** `restaurant-ordering-api-workforce`
  - scope `access_as_user`
  - app roles `Platform.Owner`, `Platform.Support`, `Platform.ReadOnly`
  - `assignmentRequired` = true (a staff member with no role cannot get a token for the API)
- **SPA** `restaurant-ordering-superadmin-workforce`
  - redirect URIs: the superadmin dev site and `http://localhost:5173`
  - consented to the API's `access_as_user` scope

## Configuration

Backend (Function App settings):

```
WORKFORCE_TENANT_ID      = <workforce tenant id>
WORKFORCE_API_CLIENT_ID  = <API app id, i.e. the token audience>
```

Superadmin site (repository **environment variables**, then a rebuild):

```
VITE_MSAL_AUTHORITY  = https://login.microsoftonline.com/<workforce tenant id>
VITE_MSAL_CLIENT_ID  = <SPA app id>
VITE_MSAL_API_SCOPE  = api://<API app id>/access_as_user
```

> **Every `VITE_*` the app reads must also be mapped in the workflow's build step env
> block.** Vite inlines those values at build time, and a variable that is not passed
> becomes `undefined` — which silently falls back to whatever the code defaults to,
> rather than failing loudly. Skipping this once shipped a bundle that paired the new
> client ID with the old tenant, which cannot sign in at all.

## The API app must issue v2.0 tokens

`api.requestedAccessTokenVersion` on the API app registration must be **2**. App
registrations created with `az ad app create` leave it `null`, which means the API is
handed **v1.0** access tokens: issuer `https://sts.windows.net/<tenant>/` and audience
`api://<app id>`. This API trusts the v2.0 form (`https://login.microsoftonline.com/<tenant>/v2.0`,
audience = bare app id) and rejects v1.0 ones — deliberately, because accepting both forms
means trusting every future tenant's `sts.windows.net` URL as well.

Check and fix:

```bash
az rest --method GET --url "https://graph.microsoft.com/v1.0/applications/<object id>?\$select=api" \
  --query api.requestedAccessTokenVersion -o tsv      # must print 2

az rest --method PATCH --url "https://graph.microsoft.com/v1.0/applications/<object id>" \
  --headers "Content-Type=application/json" --body '{"api":{"requestedAccessTokenVersion":2}}'
```

Changing it does not invalidate an existing session: the signer keeps sending the token it
already has until it expires. Sign out and back in to pick up the new one.

**Diagnosing a rejected token.** The API logs one line when it turns a token down, and it
names the actual cause:

```
[auth] no trusted issuer accepted the token: expected <issuer> with audience <id>; received iss=… aud=… ver=…; <jose error>
```

Read it from Application Insights:

```bash
az rest --method POST --url "https://management.azure.com/subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.Insights/components/<app>/api/query?api-version=2020-02-02" \
  --headers "Content-Type=application/json" \
  --body '{"query":"traces | where message contains \"[auth]\" | order by timestamp desc | take 10"}'
```

## Granting and revoking console access

Authorisation is an app role assignment in Entra, not a row in our database, so
granting and revoking are both auditable and immediate (the operator picks it up on
their next token refresh, at most an hour; they can force it by signing out and in).

```bash
API_SP=$(az ad sp show --id <API app id> --query id -o tsv)
OWNER_ROLE=$(az ad sp show --id <API app id> --query "appRoles[?value=='Platform.Owner'].id | [0]" -o tsv)
USER_ID=$(az ad user show --id <user principal name> --query id -o tsv)

# grant
az rest --method POST --url "https://graph.microsoft.com/v1.0/users/$USER_ID/appRoleAssignments" \
  --headers "Content-Type=application/json" \
  --body "{\"principalId\":\"$USER_ID\",\"resourceId\":\"$API_SP\",\"appRoleId\":\"$OWNER_ROLE\"}"

# revoke (assignment id from the listing below)
az rest --method GET --url "https://graph.microsoft.com/v1.0/servicePrincipals/$API_SP/appRoleAssignedTo"
```

## The one way in

`platformAccessLevel` in `src/infrastructure/auth/principal.ts` is the only place that maps
a token to a platform capability; every platform endpoint reaches it through
`requirePlatform(request, 'read' | 'write')` in `superAdminAuthHelpers.ts` (or
`verifySuperAdminToken`, which is `requirePlatform(…, 'write')`).

**Platform operators** — a token from the workforce tenant carrying a platform app role.
No database read.

| Role | Level | Reaches |
| --- | --- | --- |
| `Platform.Owner`, `Platform.Support` | `write` | every platform endpoint |
| `Platform.ReadOnly` | `read` | only the handlers that call `requirePlatform(…, 'read')` |
| none / other / customer-tenant token | — | nothing |

The former second route — a `systemRole: 'superadmin'` flag on the users document,
honoured for *customer* tokens — was **removed on 2026-11-10**. The single row carrying
that flag (a disposable-mail test account) was deleted first, so no user lost access;
`test/application/platformAccessEndpoints.test.ts` guards the workforce path.

### The read/write split

**Write is the default.** `verifySuperAdminToken`, `isSuperAdminPrincipal` and
`isPlatformAdmin` all mean "may change things" and refuse ReadOnly, so a new platform
endpoint, and every shop-scoped path that lets platform staff act on a shop
(`allowSuperadmin` in `shopAccess`, `createShop`), is closed to ReadOnly until someone
opts it in. A handler opts in to read access only by calling `requirePlatform(request, 'read')`,
and must change nothing when it does.

Read-level handlers (the complete list): `getAllShops`, `getPlan`, `getPlanPricing`
(operator view), `getShopUsage`, `getRejectionWatch`, `getSystemConfig`,
`getRolePermissions`, `getPlatformLegalIdentity`, and `getMe` (which reports the level).
Every other platform handler is write-level.

**Shop-scoped reads.** A handler that reads one shop's data opts ReadOnly in with
`allowPlatformRead: true` on `authorizeShopAction` / `resolveShopAccess` (`shopAccess.ts`);
`allowSuperadmin` alone stays write-level. Covered: `getShop`, `getProduct`, `getProductsByShop`,
`getCategory`, `getCategoriesByShop`, `getOrdersByShop`, `getOrderByPaymentIntent`,
`getOrderQueue`, `getOrderDocument`, `getOrderLimit`, `getShopSubscription`, `getAuditEntries`,
`getSalesReport`, `listStaff`, `getShopLegal`, `getPromotions`, `getCombos`.
Deliberately **not** covered: `getGoLiveStatus` (a GET that syncs Stripe and patches the shop)
and `exportShopData` (writes an audit entry and exports customer personal data). Never set the
flag on a handler that writes. `test/application/platformReadOnlyShopScoped.test.ts` pins both sides.

One covered read used to write: `getShopSubscription` lazily *created* a `shop_subscriptions`
document for restaurants that pre-date billing. The lazy init now stays off the platform path
(`loadShopSubscriptionResult(shopId, { initIfMissing })` — a platform operator gets the derived
default plan without it being persisted; the shop's own owner/staff still initialise). A covered
read must not write, whoever the caller is: keep this pattern in mind when a read syncs, logs or
back-fills. (The owner/staff GET still initialises, as before — that is the shop's own billing
record and is not a platform-privilege question.)

**`GET /me`** returns `systemRole: 'superadmin'` for any operator, and now also
`platformAccess: 'read' | 'write'`, derived from the verified token. A client deciding
whether to show write controls must use `platformAccess`; `systemRole` is true for both.
The API enforces the split regardless of what the client shows.

**Before assigning `Platform.ReadOnly`:** the superadmin console (`rs-superadmin`) must
read `platformAccess` and hide/disable write controls; until it does, a ReadOnly user will
see write buttons that the API answers with 403. Safe, but not tidy.

*Residue, deliberately left:* `systemRole` still exists as a stored field (`SystemRole`
type, `UserProfile`, `CosmosUserRepository`'s upsert preservation) and `executeGetMe`
still returns `systemRole: 'superadmin'` as a **response** value for platform operators,
which is what the console gates on. Nothing writes the flag to the database any more, so
the field is vestigial; the console should move to `platformAccess` and the response field can then be retired.

## Deployment identity (GitHub Actions → Azure)

The pipelines do **not** use an app registration. Deployment runs as a
**user-assigned managed identity** with federated credentials for GitHub's OIDC
issuer (`https://token.actions.githubusercontent.com`) — which is why the deploy
identity does not appear in `az ad app list`.

| | |
|---|---|
| dev identity | `restaurant-ordering-system-id-dev` in `rg-restaurant-ordering-system-dev` |
| client id | `e0261da3-ef39-4c00-bb1f-aab3a3706821` (the repo secret `AZURE_CLIENT_ID`) |
| role | **Website Contributor**, scoped to the app `restaurant-ordering-system-dev` alone |
| federated subjects | `repo:Fair-Technology/restaurant-ordering-system-backend:ref:refs/heads/{dev,main}`, plus their `repo:…@<owner-id>/…@<repo-id>` immutable forms |

`AZURE_CLIENT_ID`, `AZURE_TENANT_ID` and `AZURE_SUBSCRIPTION_ID` are the only
Azure secrets the backend repo holds (verified 2026-11-09).

**Environment subjects are deliberately avoided.** The dev workflow sets no
`environment:` because an environment-scoped OIDC subject (`…:environment:dev`)
does not match a branch-scoped credential. `promote.yml` *does* set
`environment: production` — it carries the required-reviewer approval gate — so
promotion needs a credential the dev identity does not have. Until a production
Function App exists **and** an identity carries
`repo:Fair-Technology/restaurant-ordering-system-backend:environment:production`,
`promote.yml` stops at "Login to Azure" with `AADSTS700213`. Production is
deliberately parked: nothing has been created yet.

Sibling products for reference: the invoice generator uses separate
`…-id-prod` and `oidc-msi-prod` identities, and copyshop uses a dedicated
`copyshop-api-github-oidc` app carrying both `environment:dev` and
`environment:production` subjects.

## Tests

- `test/infrastructure/trustedIssuers.test.ts` — issuer configuration
- `test/infrastructure/platformAccess.test.ts` — the gate matrix, including that a
  customer token cannot buy platform access by claiming a platform role
- `test/application/platformGateWiring.test.ts` — endpoints call the gate and obey it
