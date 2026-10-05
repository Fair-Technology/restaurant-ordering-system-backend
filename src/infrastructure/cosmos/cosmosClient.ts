import { CosmosClient, Database, Container } from '@azure/cosmos';

// Get environment variables with defaults for development
// Support both Azure Function App variable names and local development names
const endpoint =
  process.env.COSMOS_DB_ENDPOINT ||
  process.env.COSMOS_ENDPOINT ||
  'https://localhost:8081';
const key =
  process.env.COSMOS_DB_KEY ||
  process.env.COSMOS_KEY ||
  'C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==';
const databaseId =
  process.env.COSMOS_DB_DATABASE_ID || process.env.COSMOS_DB_ID || 'test-db';
const shopContainerId = process.env.COSMOS_SHOP_CONTAINER || 'shops';
const productContainerId = process.env.COSMOS_PRODUCT_CONTAINER || 'products';
const categoryContainerId =
  process.env.COSMOS_CATEGORY_CONTAINER || 'categories';
const orderContainerId = process.env.COSMOS_ORDER_CONTAINER || 'orders';
const checkoutSessionContainerId =
  process.env.COSMOS_CHECKOUT_SESSION_CONTAINER || 'checkout_sessions';
const auditLogsContainerId =
  process.env.COSMOS_AUDIT_LOGS_CONTAINER || 'auditLogs';
const usersContainerId = process.env.COSMOS_USERS_CONTAINER || 'users';
const invoiceContainerId = process.env.COSMOS_INVOICES_CONTAINER || 'invoices';

export const cosmosClient = new CosmosClient({ endpoint, key });
export const database: Database = cosmosClient.database(databaseId);
export const shopContainer: Container = database.container(shopContainerId);
export const productContainer: Container =
  database.container(productContainerId);
export const categoryContainer: Container =
  database.container(categoryContainerId);
export const orderContainer: Container = database.container(orderContainerId);
export const checkoutSessionContainer: Container =
  database.container(checkoutSessionContainerId);
export const auditLogsContainer: Container =
  database.container(auditLogsContainerId);
export const usersContainer: Container = database.container(usersContainerId);
export const invoiceContainer: Container =
  database.container(invoiceContainerId);

const planContainerId = process.env.COSMOS_PLANS_CONTAINER || 'plans';
const planPricingContainerId = process.env.COSMOS_PLAN_PRICING_CONTAINER || 'plan_pricing';
const subscriptionContainerId = process.env.COSMOS_SUBSCRIPTIONS_CONTAINER || 'shop_subscriptions';
const usageContainerId = process.env.COSMOS_USAGE_CONTAINER || 'shop_usage';
const systemConfigContainerId = process.env.COSMOS_SYSTEM_CONFIG_CONTAINER || 'system_config';
const staffAccountsContainerId = process.env.COSMOS_STAFF_ACCOUNTS_CONTAINER || 'staff_accounts';

export const planContainer: Container = database.container(planContainerId);
export const planPricingContainer: Container = database.container(planPricingContainerId);
export const subscriptionContainer: Container = database.container(subscriptionContainerId);
export const usageContainer: Container = database.container(usageContainerId);
export const systemConfigContainer: Container = database.container(systemConfigContainerId);
export const staffAccountsContainer: Container = database.container(staffAccountsContainerId);
