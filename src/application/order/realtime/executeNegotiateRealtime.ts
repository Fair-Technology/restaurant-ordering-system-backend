import type { HttpRequest } from '@azure/functions';
import { negotiateShopConnection } from '../../../infrastructure/realtime/webPubSub';
import { logServiceFailure } from '../../_shared/logServiceFailure';
import type { ApplicationResult } from '../../_shared/types';
import { loadShopForOrderAction } from '../intake/loadShopForOrderAction';
import type { RealtimeConnectionDto } from './dtos';

/** A connection URL for the shop's live order channel (Web PubSub group = shop id). */
export async function executeNegotiateRealtime(
  request: { shopId: string },
  httpRequest: HttpRequest,
): Promise<ApplicationResult<RealtimeConnectionDto>> {
  try {
    const loaded = await loadShopForOrderAction(request.shopId, httpRequest);
    if (!loaded.ok) return loaded;
    const connection = await negotiateShopConnection(loaded.shop.id, loaded.actor.actorId);
    return { ok: true, data: connection ?? { url: null, accessToken: null } };
  } catch (error: any) {
    logServiceFailure('NegotiateRealtime', error);
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to open the live channel' };
  }
}
