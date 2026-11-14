/**
 * Injected-clock routes (e.g. running the 90-day wind-down "as of" a chosen date) exist only where
 * the app setting `ENABLE_TEST_CLOCK_ROUTES` is exactly the string `true`.
 *
 * Why an explicit opt-in rather than an environment name: `AZURE_FUNCTIONS_ENVIRONMENT` is
 * `Production` on EVERY deployed Function App, dev included, and unset locally — it cannot tell dev
 * from prod, and keying on "unset" would switch the route on wherever the variable is missing.
 * Fail-closed instead: missing, empty, `True`, `1`, anything but `true` → the route does not exist.
 * infra/main.bicep sets it to `true` for env == 'dev' only.
 */
export const TEST_CLOCK_ROUTES_SETTING = 'ENABLE_TEST_CLOCK_ROUTES';

export function testClockRoutesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[TEST_CLOCK_ROUTES_SETTING] === 'true';
}

/**
 * What the Functions host answers for a route that is not registered: 404, no body. A disabled
 * test-clock route answers exactly this, before reading auth or the body, so a caller cannot tell
 * "does not exist" from "exists but you may not use it".
 */
export const ROUTE_ABSENT = Object.freeze({ status: 404 });
