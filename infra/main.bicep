// Restaurant-ordering-system — one environment's Azure resources.
//
// Reproduces what was created by hand for dev on 2026-09-23, so a second
// environment is one command rather than an afternoon in the portal:
//
//   az group create -n rg-restaurant-ordering-system-test -l westeurope
//   az deployment group create -g rg-restaurant-ordering-system-test \
//     -f infra/main.bicep -p env=test
//
// Production is the same template with infra/main.prod.bicepparam, which sets
// the names, region and hardening that differ from dev. The database, storage
// account and Function App each have their own name parameter, so none of them
// is forced to follow the `<prefix>-<env>` pattern. See docs/reports/2026-11-13-d1.md.
//
// Everything sits in the EU because the platform holds diner data as a
// processor for restaurants in Germany, and Australia has no EU adequacy
// decision. Do not move these to an Australian region.
//
// What this file leaves to the owner, deliberately:
//   - Entra app registrations (a tenant-level change, made by hand)
//   - Stripe configuration (not an Azure resource)
//   - secret app settings — they are set after deployment from the vault .env
//   - the GitHub federated credential and its role assignment, UNLESS
//     githubFederatedSubject is set: then this file creates both (the
//     credential on the deployment identity, Website Contributor on the
//     Function App). Empty (the default) means add it by hand — see README.

@description('Environment suffix: dev, test, prod.')
@allowed(['dev', 'test', 'prod'])
param env string

@description('Region for compute and data. Must stay in the EU.')
param location string = 'westeurope'

@description('Function App name. Globally unique (*.azurewebsites.net). Production is "restaurant-ordering-system" because promote.yml deploys to that name.')
@minLength(2)
@maxLength(60)
param functionAppName string = 'restaurant-ordering-system-${env}'

@description('Storage account name: 3-24 chars, lowercase letters and digits only. Globally unique.')
@minLength(3)
@maxLength(24)
param storageAccountName string = 'restaurantordsys${env}'

@description('Cosmos DB account name: 3-44 chars, lowercase letters, digits and hyphens. Globally unique.')
@minLength(3)
@maxLength(44)
param cosmosAccountName string = 'restaurant-ordering-system-db-${env}'

@description('Cosmos database name inside the account. The same in every environment, so the code needs no per-environment change.')
param databaseName string = 'restaurant-ordering-system-db'

@description('Cosmos continuous-backup retention window.')
@allowed(['Continuous7Days', 'Continuous30Days'])
param cosmosBackupTier string = 'Continuous7Days'

@description('Create an explicit Log Analytics workspace and make Application Insights workspace-based. false keeps dev\'s shape (Azure-managed workspace).')
param createLogAnalytics bool = false

@description('Days of soft delete for blobs and containers. 0 = off (dev). Production uses 30.')
@minValue(0)
@maxValue(365)
param blobSoftDeleteDays int = 0

@description('Optional federated-credential subject for GitHub Actions, e.g. "repo:Fair-Technology/restaurant-ordering-system-backend:environment:production". Empty = create none (add it by hand, see README).')
param githubFederatedSubject string = ''

@description('Region for Static Web Apps — a shorter list than other services.')
@allowed(['westeurope', 'eastasia', 'centralus', 'eastus2', 'westus2'])
param staticWebAppLocation string = 'westeurope'

var prefix = 'restaurant-ordering-system'
var storageName = storageAccountName
var cosmosName = cosmosAccountName

// Containers and their partition keys. Products and categories partition by
// shop so one restaurant's menu reads as a single partition; everything else
// is keyed by its own id. Staff accounts partition by shop too, so one
// restaurant's staff reads as a single partition, with a unique key on
// username scoped to that partition.
var containers = [
  { name: 'shops', pk: '/id', uniqueKeys: [] }
  { name: 'products', pk: '/shopId', uniqueKeys: [] }
  { name: 'categories', pk: '/shopId', uniqueKeys: [] }
  { name: 'orders', pk: '/id', uniqueKeys: [] }
  { name: 'checkout_sessions', pk: '/id', uniqueKeys: [] }
  { name: 'users', pk: '/id', uniqueKeys: [] }
  { name: 'plans', pk: '/id', uniqueKeys: [] }
  { name: 'plan_pricing', pk: '/id', uniqueKeys: [] }
  { name: 'shop_subscriptions', pk: '/id', uniqueKeys: [] }
  { name: 'shop_usage', pk: '/id', uniqueKeys: [] }
  { name: 'auditLogs', pk: '/id', uniqueKeys: [] }
  { name: 'system_config', pk: '/id', uniqueKeys: [] }
  { name: 'staff_accounts', pk: '/shopId', uniqueKeys: [ '/username' ] }
  { name: 'invoices', pk: '/shopId', uniqueKeys: [ '/number' ] }
]

var staticApps = ['storefront', 'admin', 'superadmin']

// ── Data ──────────────────────────────────────────────────────────────────────

// Serverless: this bills per request rather than per provisioned throughput,
// which is the right shape for an environment that is idle most of the day.
resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2024-11-15' = {
  name: cosmosName
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    consistencyPolicy: { defaultConsistencyLevel: 'Session' }
    locations: [ { locationName: location, failoverPriority: 0, isZoneRedundant: false } ]
    capabilities: [ { name: 'EnableServerless' } ]
    backupPolicy: { type: 'Continuous', continuousModeProperties: { tier: cosmosBackupTier } }
    minimalTlsVersion: 'Tls12'
  }
}

resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-11-15' = {
  parent: cosmos
  name: databaseName
  properties: { resource: { id: databaseName } }
}

resource cosmosContainers 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-11-15' = [for c in containers: {
  parent: database
  name: c.name
  properties: {
    resource: {
      id: c.name
      partitionKey: { paths: [ c.pk ], kind: 'Hash' }
      uniqueKeyPolicy: empty(c.uniqueKeys) ? null : { uniqueKeys: [ { paths: c.uniqueKeys } ] }
      // -1 = each item's own ttl applies (checkout sessions set 3600); nothing expires without one
      defaultTtl: c.name == 'checkout_sessions' ? -1 : null
    }
  }
}]

// Holds menu and dish images, and the Functions deployment package.
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    // Shop logos, cover images and dish photos are shown to diners straight from
    // storage, so public reads must be possible. Only the product-media container
    // turns them on; every other container stays private.
    allowBlobPublicAccess: true
  }
}

// The admin uploads images straight from the browser to storage with a
// short-lived upload link, so storage must accept cross-site requests from the
// front-ends or the browser blocks the upload.
resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
  properties: {
    deleteRetentionPolicy: { enabled: blobSoftDeleteDays > 0, days: max(blobSoftDeleteDays, 1) }
    containerDeleteRetentionPolicy: { enabled: blobSoftDeleteDays > 0, days: max(blobSoftDeleteDays, 1) }
    cors: {
      corsRules: [
        {
          allowedOrigins: [for (app, i) in staticApps: 'https://${staticSites[i].properties.defaultHostname}']
          allowedMethods: [ 'GET', 'HEAD', 'PUT', 'OPTIONS' ]
          allowedHeaders: [ '*' ]
          exposedHeaders: [ '*' ]
          maxAgeInSeconds: 3600
        }
      ]
    }
  }
}

resource deploymentContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  name: '${storageName}/default/app-package'
  dependsOn: [ storage ]
}

// Shop and dish images. 'Blob' lets anyone read a file by its exact address,
// but not list the container's contents.
resource mediaContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'product-media'
  properties: {
    publicAccess: 'Blob'
  }
}

// ── Identity and telemetry ────────────────────────────────────────────────────

// Used by GitHub Actions to deploy without a stored password. Its federated
// credential — which names the repo and branch allowed to use it — is added
// after deployment, because it changes whenever a repo is renamed.
resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${prefix}-id-${env}'
  location: location
}

resource logWorkspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = if (createLogAnalytics) {
  name: 'log-${prefix}-${env}'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${prefix}-${env}'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: createLogAnalytics ? logWorkspace.id : null
  }
}

// ── Compute ───────────────────────────────────────────────────────────────────

// Flex Consumption: scales to zero when nobody is ordering, which is most of
// the time in a non-production environment.
resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: 'asp-${prefix}-${env}'
  location: location
  sku: { name: 'FC1', tier: 'FlexConsumption' }
  kind: 'functionapp'
  properties: { reserved: true }
}

resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: functionAppName
  location: location
  kind: 'functionapp,linux'
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${identity.id}': {} }
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    functionAppConfig: {
      runtime: { name: 'node', version: '22' }
      scaleAndConcurrency: { instanceMemoryMB: 2048, maximumInstanceCount: 40 }
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${storage.properties.primaryEndpoints.blob}app-package'
          authentication: {
            type: 'UserAssignedIdentity'
            userAssignedIdentityResourceId: identity.id
          }
        }
      }
    }
    siteConfig: {
      // The three front-ends call the API from the browser, so their origins
      // must be allowed here or every request is blocked.
      cors: {
        allowedOrigins: [for (app, i) in staticApps: 'https://${staticSites[i].properties.defaultHostname}']
      }
      appSettings: [
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: insights.properties.ConnectionString }
        { name: 'COSMOS_DB_ENDPOINT', value: cosmos.properties.documentEndpoint }
        { name: 'COSMOS_DB_DATABASE_ID', value: databaseName }
        { name: 'COSMOS_SHOP_CONTAINER', value: 'shops' }
        { name: 'COSMOS_PRODUCT_CONTAINER', value: 'products' }
        { name: 'COSMOS_CATEGORY_CONTAINER', value: 'categories' }
        { name: 'COSMOS_USERS_CONTAINER', value: 'users' }
        { name: 'COSMOS_PLANS_CONTAINER', value: 'plans' }
        { name: 'COSMOS_PLAN_PRICING_CONTAINER', value: 'plan_pricing' }
        { name: 'COSMOS_SUBSCRIPTIONS_CONTAINER', value: 'shop_subscriptions' }
        { name: 'COSMOS_USAGE_CONTAINER', value: 'shop_usage' }
        { name: 'COSMOS_CHECKOUT_SESSION_CONTAINER', value: 'checkout_sessions' }
        { name: 'STORAGE_ACCOUNT_NAME', value: storageName }
        // Host state (timer leases) over the identity, so no storage key sits in the template.
        { name: 'AzureWebJobsStorage__accountName', value: storageName }
        { name: 'AzureWebJobsStorage__credential', value: 'managedidentity' }
        { name: 'AzureWebJobsStorage__clientId', value: identity.properties.clientId }
        // Where Stripe sends the owner back after subscription checkout.
        { name: 'ADMIN_APP_URL', value: 'https://${staticSites[indexOf(staticApps, 'admin')].properties.defaultHostname}' }
        // Secrets — COSMOS_DB_KEY, STORAGE_ACCOUNT_KEY, ENTRA_*, STRIPE_* — are
        // set after deployment from the vault .env, never committed here.
      ]
    }
  }
}

// The identity reads the deployment package and holds the host's timer leases.
var storageBlobDataOwner = 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b'
resource identityStorageAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, identity.id, storageBlobDataOwner)
  scope: storage
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataOwner)
  }
}

// GitHub Actions deploy credential — only when a subject is supplied.
resource githubCredential 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = if (!empty(githubFederatedSubject)) {
  parent: identity
  name: 'github-${env}'
  properties: {
    issuer: 'https://token.actions.githubusercontent.com'
    subject: githubFederatedSubject
    audiences: [ 'api://AzureADTokenExchange' ]
  }
}

var websiteContributor = 'de139f84-1756-47ae-9be6-808fbbe84772'
resource deployRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(githubFederatedSubject)) {
  name: guid(functionApp.id, identity.id, websiteContributor)
  scope: functionApp
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', websiteContributor)
  }
}

// ── Front-ends ────────────────────────────────────────────────────────────────

resource staticSites 'Microsoft.Web/staticSites@2023-12-01' = [for app in staticApps: {
  name: '${prefix}-${app}-${env}'
  location: staticWebAppLocation
  sku: { name: 'Free', tier: 'Free' }
  properties: {}
}]

// ── Outputs ───────────────────────────────────────────────────────────────────

output functionAppName string = functionApp.name
output functionAppHostname string = functionApp.properties.defaultHostName
output cosmosAccountName string = cosmos.name
output logAnalyticsWorkspace string = createLogAnalytics ? logWorkspace.name : ''
output cosmosEndpoint string = cosmos.properties.documentEndpoint
output storageAccountName string = storageName
output identityClientId string = identity.properties.clientId
output identityPrincipalId string = identity.properties.principalId
output staticWebAppNames array = [for (app, i) in staticApps: staticSites[i].name]
