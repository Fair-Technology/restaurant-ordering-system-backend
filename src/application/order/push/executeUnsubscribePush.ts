import type { HttpRequest } from '@azure/functions';
import { softDeleteSubscription } from '../../../infrastructure/cosmos/push/CosmosPushSubscriptionRepository';
import { logServiceFailure } from '../../_shared/logServiceFailure';
import type { ApplicationResult } from '../../_shared/types';
import { loadShopForOrderAction } from '../intake/loadShopForOrderAction';
import type { UnsubscribePushRequestDto, UnsubscribePushResultDto } from './dtos';
import { isHttpsUrl, PUSH_ENDPOINT_ERROR } from './executeSubscribePush';

export async function executeUnsubscribePush(
  request: { shopId: string } & Partial<UnsubscribePushRequestDto>,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<UnsubscribePushResultDto>> {
  try {
    const loaded = await loadShopForOrderAction(request.shopId, httpRequest);
    if (!loaded.ok) return loaded;
    if (!isHttpsUrl(request.endpoint)) return { ok: false, code: 'INVALID_INPUT', error: PUSH_ENDPOINT_ERROR };
    await softDeleteSubscription(loaded.shop.id, request.endpoint);
    return { ok: true, data: { ok: true } };
  } catch (error: any) {
    logServiceFailure('UnsubscribePush', error);
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to remove the subscription' };
  }
}
