import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../src/application/order/intake/loadShopForOrderAction', () => ({ loadShopForOrderAction: vi.fn() }));
vi.mock('../../../../src/infrastructure/push/webPush', () => ({ pushPublicKey: vi.fn() }));
vi.mock('../../../../src/infrastructure/realtime/webPubSub', () => ({ negotiateShopConnection: vi.fn() }));
vi.mock('../../../../src/infrastructure/cosmos/push/CosmosPushSubscriptionRepository', () => ({
  upsertSubscription: vi.fn(async (s) => s),
  softDeleteSubscription: vi.fn(async () => true),
}));

import { loadShopForOrderAction } from '../../../../src/application/order/intake/loadShopForOrderAction';
import { executeGetPushPublicKey } from '../../../../src/application/order/push/executeGetPushPublicKey';
import { executeSubscribePush } from '../../../../src/application/order/push/executeSubscribePush';
import { executeUnsubscribePush } from '../../../../src/application/order/push/executeUnsubscribePush';
import { executeNegotiateRealtime } from '../../../../src/application/order/realtime/executeNegotiateRealtime';
import { pushSubscriptionId } from '../../../../src/domain/push/PushSubscription';
import { mapResultToHttp } from '../../../../src/functions/_shared/mapResultToHttp';
import { upsertSubscription } from '../../../../src/infrastructure/cosmos/push/CosmosPushSubscriptionRepository';
import { pushPublicKey } from '../../../../src/infrastructure/push/webPush';
import { negotiateShopConnection } from '../../../../src/infrastructure/realtime/webPubSub';

const http = { headers: { get: () => 'UA/1' } } as any;
const keys = { p256dh: 'p', auth: 'a' };
const good = { shopId: 'shop-1', endpoint: 'https://push.example/x', keys };

describe('realtime + push services', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (loadShopForOrderAction as any).mockResolvedValue({ ok: true, shop: { id: 'shop-1' }, actor: { actorId: 'u1' } });
    (pushPublicKey as any).mockReturnValue('pub');
  });

  it('negotiate returns nulls when unconfigured (200 with null fields)', async () => {
    (negotiateShopConnection as any).mockResolvedValue(null);
    const res = await executeNegotiateRealtime({ shopId: 'shop-1' }, http);
    expect(res).toEqual({ ok: true, data: { url: null, accessToken: null } });
    expect(mapResultToHttp(res).status).toBe(200);
    expect(negotiateShopConnection).toHaveBeenCalledWith('shop-1', 'u1');
  });

  it('negotiate and the public key return the auth error as is', async () => {
    const denied = { ok: false, code: 'FORBIDDEN', error: 'no' };
    (loadShopForOrderAction as any).mockResolvedValue(denied);
    expect(await executeNegotiateRealtime({ shopId: 'shop-1' }, http)).toEqual(denied);
    expect(await executeGetPushPublicKey({ shopId: 'shop-1' }, http)).toEqual(denied);
  });

  it('public key is null when unset', async () => {
    (pushPublicKey as any).mockReturnValue(null);
    expect(await executeGetPushPublicKey({ shopId: 'shop-1' }, http)).toEqual({ ok: true, data: { publicKey: null } });
  });

  it('subscribe: unconfigured -> NOT_CONFIGURED -> 503', async () => {
    (pushPublicKey as any).mockReturnValue(null);
    const res = await executeSubscribePush(good, http);
    expect(res).toMatchObject({ ok: false, code: 'NOT_CONFIGURED' });
    expect(mapResultToHttp(res).status).toBe(503);
  });

  it.each([
    ['http endpoint', { ...good, endpoint: 'http://push.example/x' }],
    ['not a url', { ...good, endpoint: 'nope' }],
    ['missing endpoint', { shopId: 'shop-1', keys }],
    ['empty auth', { ...good, keys: { p256dh: 'p', auth: '' } }],
    ['missing keys', { shopId: 'shop-1', endpoint: good.endpoint }],
  ])('subscribe rejects %s', async (_n, body) => {
    expect(await executeSubscribePush(body as any, http)).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(upsertSubscription).not.toHaveBeenCalled();
  });

  it('subscribe stores a deterministic id', async () => {
    const res = await executeSubscribePush(good, http);
    const id = pushSubscriptionId('shop-1', good.endpoint);
    expect(res).toEqual({ ok: true, data: { id } });
    expect(upsertSubscription).toHaveBeenCalledWith(expect.objectContaining({ id, shopId: 'shop-1', userAgent: 'UA/1', isDeleted: false }));
  });

  it('unsubscribe validates and soft-deletes', async () => {
    expect(await executeUnsubscribePush({ shopId: 'shop-1', endpoint: 'x' }, http)).toMatchObject({ code: 'INVALID_INPUT' });
    expect(await executeUnsubscribePush({ shopId: 'shop-1', endpoint: good.endpoint }, http)).toEqual({ ok: true, data: { ok: true } });
  });
});
