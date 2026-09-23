// Restaurant-ordering-system — one environment's Azure resources.
//
// Reproduces what was created by hand for dev on 2026-09-23, so a second
// environment is one command rather than an afternoon in the portal:
//
//   az group create -n rg-restaurant-ordering-system-test -l westeurope
//   az deployment group create -g rg-restaurant-ordering-system-test \
//     -f infra/main.bicep -p env=test
//
// Everything sits in the EU because the platform holds diner data as a
// processor for restaurants in Germany, and Australia has no EU adequacy
// decision. Do not move these to an Australian region.
//
// What this file does NOT create, deliberately:
//   - Entra app registrations (a tenant-level change, made by hand)
//   - Stripe configuration (not an Azure resource)
//   - the GitHub federated credential and its role assignment (see README)
//   - secret app settings — they are set after deployment from the vault .env

@description('Environment suffix: dev, test, prod.')
@allowed(['dev', 'test', 'prod'])
param env string

@description('Region for compute and data. Must stay in the EU.')
param location string = 'westeurope'

@description('Region for Static Web Apps — a shorter list than other services.')
@allowed(['westeurope', 'eastasia', 'centralus', 'eastus2', 'westus2'])
param staticWebAppLocation string = 'westeurope'

var prefix = 'restaurant-ordering-system'
var storageName = 'restaurantordsys${env}'   // ≤24 chars, lowercase alphanumeric
var cosmosName = '${prefix}-db-${env}'
var databaseName = '${prefix}-db'

// Containers and their partition keys. Products and categories partition by
// shop so one restaurant's menu reads as a single partition; everything else
// is keyed by its own id.
var containers = [
  { name: 'shops', pk: '/id' }
  { name: 'products', pk: '/shopId' }
  { name: 'categories', pk: '/shopId' }
  { name: 'orders', pk: '/id' }
  { name: 'checkout_sessions', pk: '/id' }
  { name: 'users', pk: '/id' }
  { name: 'plans', pk: '/id' }
  { name: 'plan_pricing', pk: '/id' }
  { name: 'shop_subscriptions', pk: '/id' }
  { name: 'shop_usage', pk: '/id' }
  { name: 'auditLogs', pk: '/id' }
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
    backupPolicy: { type: 'Continuous' }
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
    allowBlobPublicAccess: false
  }
}

resource deploymentContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  name: '${storageName}/default/app-package'
  dependsOn: [ storage ]
}

// ── Identity and telemetry ────────────────────────────────────────────────────

// Used by GitHub Actions to deploy without a stored password. Its federated
// credential — which names the repo and branch allowed to use it — is added
// after deployment, because it changes whenever a repo is renamed.
resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${prefix}-id-${env}'
  location: location
}

resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${prefix}-${env}'
  location: location
  kind: 'web'
  properties: { Application_Type: 'web' }
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
  name: '${prefix}-${env}'
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
      runtime: { name: 'node', version: '20' }
      scaleAndConcurrency: { instanceMemoryMB: 2048, maximumInstanceCount: 40 }
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${storage.properties.primaryEndpoints.blob}app-package'
          authentication: { type: 'SystemAssignedIdentity' }
        }
      }
    }
    siteConfig: {
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
        // Secrets — COSMOS_DB_KEY, STORAGE_ACCOUNT_KEY, ENTRA_*, STRIPE_* — are
        // set after deployment from the vault .env, never committed here.
      ]
    }
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
output cosmosEndpoint string = cosmos.properties.documentEndpoint
output storageAccountName string = storageName
output identityClientId string = identity.properties.clientId
output identityPrincipalId string = identity.properties.principalId
output staticWebAppNames array = [for (app, i) in staticApps: staticSites[i].name]
