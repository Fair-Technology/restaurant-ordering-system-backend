import type { HttpRequest } from '@azure/functions';
import { pushPublicKey } from '../../../infrastructure/push/webPush';
import { logServiceFailure } from '../../_shared/logServiceFailure';
import type { ApplicationResult } from '../../_shared/types';
import { loadShopForOrderAction } from '../intake/loadShopForOrderAction';
import type { PushPublicKeyDto } from './dtos';

export async function executeGetPushPublicKey(
  request: { shopId: string },
  httpRequest: HttpRequest,
): Promise<ApplicationResult<PushPublicKeyDto>> {
  try {
    const loaded = await loadShopForOrderAction(request.shopId, httpRequest);
    if (!loaded.ok) return loaded;
    return { ok: true, data: { publicKey: pushPublicKey() } };
  } catch (error: any) {
    logServiceFailure('GetPushPublicKey', error);
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to read the push key' };
  }
}
