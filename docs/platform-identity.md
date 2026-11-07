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

## The two ways in, and why they are separate

`isSuperAdminPrincipal` in `src/infrastructure/auth/superAdminAuthHelpers.ts` is the
only place that answers this question; every platform endpoint calls it (via
`verifySuperAdminToken`, or directly when it has already authenticated the caller).

1. **Platform operators** — token from the workforce tenant carrying
   `Platform.Owner` or `Platform.Support`. No database read.
2. **Legacy app users** — `systemRole: 'superadmin'` on the users document. Kept only
   while existing superadmins migrate, and only honoured for *customer* tokens, so a
   workforce identity can never fall back to it.

`Platform.ReadOnly` is defined but deliberately denied: the console has no per-endpoint
read/write split yet, so anything short of Owner/Support is refused rather than silently
handed full access. Add that split before assigning the role.

## Tests

- `test/infrastructure/trustedIssuers.test.ts` — issuer configuration
- `test/infrastructure/platformAccess.test.ts` — the gate matrix, including that a
  customer token cannot buy platform access by claiming a platform role
- `test/application/platformGateWiring.test.ts` — endpoints call the gate and obey it
