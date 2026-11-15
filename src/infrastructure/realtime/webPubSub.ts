import { WebPubSubServiceClient } from '@azure/web-pubsub';
import { errorBrief } from '../../application/_shared/errorBrief';

export const ordersHub = 'orders';

let client: WebPubSubServiceClient | null | undefined;

/** Lazy singleton; null when WEB_PUBSUB_CONNECTION_STRING is unset (the feature is off). */
function getClient(): WebPubSubServiceClient | null {
  if (client !== undefined) return client;
  const connectionString = process.env.WEB_PUBSUB_CONNECTION_STRING;
  client = connectionString ? new WebPubSubServiceClient(connectionString, ordersHub) : null;
  return client;
}

/** Test seam: forget the cached client so the next call re-reads the environment. */
export function resetWebPubSubClient(): void {
  client = undefined;
}

/** A client token that joins the shop's group on connect. Null when Web PubSub is not configured. */
export async function negotiateShopConnection(
  shopId: string,
  userId: string,
): Promise<{ url: string; accessToken: string } | null> {
  const c = getClient();
  if (!c) return null;
  const { url, token } = await c.getClientAccessToken({ userId, groups: [shopId], expirationTimeInMinutes: 60 });
  return { url, accessToken: token };
}

/** Sends a JSON signal to every connection in the shop's group. No-op when unconfigured. Never throws. */
export async function publishToShop(shopId: string, payload: object): Promise<void> {
  try {
    const c = getClient();
    if (!c) return;
    await c.group(shopId).sendToAll(payload as Record<string, unknown>); // JSON overload: sent as application/json
  } catch (err: unknown) {
    console.error('[realtime:error]', errorBrief(err));
  }
}
