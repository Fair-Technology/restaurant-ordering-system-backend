import type { HttpRequest } from '@azure/functions';
import { pushSubscriptionId } from '../../../domain/push/PushSubscription';
import { upsertSubscription } from '../../../infrastructure/cosmos/push/CosmosPushSubscriptionRepository';
import { pushPublicKey } from '../../../infrastructure/push/webPush';
import { logServiceFailure } from '../../_shared/logServiceFailure';
import type { ApplicationResult } from '../../_shared/types';
import { loadShopForOrderAction } from '../intake/loadShopForOrderAction';
import type { SubscribePushRequestDto, SubscribePushResultDto } from './dtos';

export const PUSH_ENDPOINT_ERROR = 'endpoint must be an https URL';
export const PUSH_KEYS_ERROR = 'keys.p256dh and keys.auth are required';
const MAX_ENDPOINT_CHARS = 2048;

export function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_ENDPOINT_CHARS) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/** Registers this device for new-order push notifications; idempotent per (shop, endpoint). */
export async function executeSubscribePush(
  request: { shopId: string } & Partial<SubscribePushRequestDto>,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<SubscribePushResultDto>> {
  try {
    if (!pushPublicKey()) return { ok: false, code: 'NOT_CONFIGURED', error: 'Push notifications are not configured' };
    const loaded = await loadShopForOrderAction(request.shopId, httpRequest);
    if (!loaded.ok) return loaded;
    if (!isHttpsUrl(request.endpoint)) return { ok: false, code: 'INVALID_INPUT', error: PUSH_ENDPOINT_ERROR };
    const keys = request.keys;
    if (
      !keys ||
      typeof keys.p256dh !== 'string' || keys.p256dh.trim() === '' ||
      typeof keys.auth !== 'string' || keys.auth.trim() === ''
    ) {
      return { ok: false, code: 'INVALID_INPUT', error: PUSH_KEYS_ERROR };
    }
    const id = pushSubscriptionId(loaded.shop.id, request.endpoint);
    await upsertSubscription({
      id,
      shopId: loaded.shop.id,
      endpoint: request.endpoint,
      keys: { p256dh: keys.p256dh, auth: keys.auth },
      userAgent: httpRequest.headers.get('user-agent'),
      createdAt: new Date().toISOString(),
      isDeleted: false,
    });
    return { ok: true, data: { id } };
  } catch (error: any) {
    logServiceFailure('SubscribePush', error);
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to save the subscription' };
  }
}
