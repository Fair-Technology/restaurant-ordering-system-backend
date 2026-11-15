import webpush from 'web-push';
import { errorBrief } from '../../application/_shared/errorBrief';

export type PushTarget = { endpoint: string; keys: { p256dh: string; auth: string } };

export function pushPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

/** 'gone' = the push service says the subscription is dead (404/410): delete it. Never throws. */
export async function sendPushNotification(subscription: PushTarget, payload: object): Promise<'sent' | 'gone' | 'failed'> {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!pub || !priv || !subject) return 'failed';
  try {
    webpush.setVapidDetails(subject, pub, priv);
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: subscription.keys },
      JSON.stringify(payload),
    );
    return 'sent';
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode;
    if (status === 404 || status === 410) return 'gone';
    console.error('[push:error]', errorBrief(err));
    return 'failed';
  }
}
