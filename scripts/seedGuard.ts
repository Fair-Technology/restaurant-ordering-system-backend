// Refuses to run the seed script against anything but the restaurant-ordering
// dev database. The seed wipes almost every container, so pointing it at the
// wrong database (e.g. a stale local.settings.json still aimed at the old
// online-ordering-system database) must fail loudly before any delete runs.

export const ALLOWED_SEED_HOSTS: readonly string[] = [
  'restaurant-ordering-system-db-dev.documents.azure.com',
  'localhost',
  '127.0.0.1',
];

export function assertSeedTargetIsDev(endpoint: string | undefined): void {
  const host = new URL(endpoint ?? 'https://localhost:8081').hostname;
  if (!ALLOWED_SEED_HOSTS.includes(host)) {
    throw new Error(`Refusing to seed: ${host} is not the restaurant-ordering dev database`);
  }
}
