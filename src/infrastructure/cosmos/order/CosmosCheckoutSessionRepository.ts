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
