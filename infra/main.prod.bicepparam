using 'main.bicep'

// Production. Names and settings follow docs/specs.md §20.
// No secrets here: secret app settings are set after deployment.

param env = 'prod'

// Germany West Central for compute, data and telemetry (docs/specs.md §20, "Production environment").
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
// Two forms on purpose — this repo presents GitHub's IMMUTABLE OIDC subject
// (`use_immutable_subject: true`; prefix verified read-only 2026-11-13 with
// `gh api repos/Fair-Technology/restaurant-ordering-system-backend/actions/oidc/customization/sub`).
// The immutable one is the subject the token actually carries; the classic one
// is kept to match dev's identity, which registers both. Same pair as
// docs/specs.md §20.
param githubFederatedSubject = 'repo:Fair-Technology/restaurant-ordering-system-backend:environment:production'
param githubFederatedSubjectImmutable = 'repo:Fair-Technology@175465322/restaurant-ordering-system-backend@1050545921:environment:production'

// Email: OWNER MUST SET once the domain is named and DNS-verified (see infra/README.md,
// "Order emails and timer"). Until both are uncommented, prod stays on EMAIL_TRANSPORT=log.
// param prodEmailDomainName = 'mail.example.com'
// param enableAcsEmail = true
