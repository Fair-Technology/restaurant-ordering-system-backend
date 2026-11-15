import { createHash } from 'crypto';

export interface PushSubscription {
  id: string; // sha256(`${shopId}:${endpoint}`) hex — deterministic, so re-subscribe is idempotent
  shopId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent: string | null;
  createdAt: string; // ISO
  isDeleted: boolean; // soft delete, revived on re-subscribe
}

export function pushSubscriptionId(shopId: string, endpoint: string): string {
  return createHash('sha256').update(`${shopId}:${endpoint}`).digest('hex');
}
