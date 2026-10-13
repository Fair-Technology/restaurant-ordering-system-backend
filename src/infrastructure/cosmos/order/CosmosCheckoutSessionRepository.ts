import { CheckoutSession } from '../../../domain/order/CheckoutSession';
import { checkoutSessionContainer } from '../cosmosClient';

export async function createCheckoutSession(session: CheckoutSession): Promise<CheckoutSession> {
  const { resource } = await checkoutSessionContainer.items.create<CheckoutSession>(session);
  return resource!;
}

/** Saves the session, replacing an earlier one with the same id (a diner paying again with another card). */
export async function upsertCheckoutSession(session: CheckoutSession): Promise<CheckoutSession> {
  const { resource } = await checkoutSessionContainer.items.upsert<CheckoutSession>(session);
  return resource!;
}

export async function findCheckoutSessionById(sessionId: string): Promise<CheckoutSession | null> {
  try {
    const { resource } = await checkoutSessionContainer.item(sessionId, sessionId).read<CheckoutSession>();
    return resource || null;
  } catch (error: any) {
    if (error.code === 404) return null;
    throw error;
  }
}

export async function deleteCheckoutSession(sessionId: string): Promise<void> {
  try {
    await checkoutSessionContainer.item(sessionId, sessionId).delete();
  } catch (error: any) {
    if (error.code === 404) return; // already gone — idempotent
    throw error;
  }
}

/** Checkouts last written in [oldest, newest] (Cosmos _ts, epoch seconds). */
export async function findCheckoutSessionsWrittenBetween(oldestEpochSeconds: number, newestEpochSeconds: number): Promise<CheckoutSession[]> {
  const { resources } = await checkoutSessionContainer.items
    .query<CheckoutSession>({
      query: 'SELECT * FROM c WHERE c._ts >= @oldest AND c._ts <= @newest',
      parameters: [{ name: '@oldest', value: oldestEpochSeconds }, { name: '@newest', value: newestEpochSeconds }],
    })
    .fetchAll();
  return resources;
}
