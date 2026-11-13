using 'main.bicep'

// Production. Names and settings follow docs/prod-runbook.md §0.
// No secrets here: secret app settings are set after deployment.

param env = 'prod'

// Germany West Central for compute, data and telemetry (runbook §1).
param location = 'germanywestcentral'
// Static Web Apps are not offered in Germany West Central.
param staticWebAppLocation = 'westeurope'

// promote.yml deploys to this exact name. Globally unique: check first.
param functionAppName = 'restaurant-ordering-system'
param storageAccountName = 'restaurantordsysprod'
param cosmosAccountName = 'restaurant-ordering-system-db-prod'
param databaseName = 'restaurant-ordering-system-db'

param cosmosBackupTier = 'Continuous30Days'
param createLogAnalytics = true
param blobSoftDeleteDays = 30

// OWNER MUST CONFIRM: the GitHub environment subject promote.yml runs under.
param githubFederatedSubject = 'repo:Fair-Technology/restaurant-ordering-system-backend:environment:production'
