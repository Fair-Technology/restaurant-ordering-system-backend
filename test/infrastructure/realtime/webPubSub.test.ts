import { beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  getClientAccessToken: vi.fn(),
  sendToAll: vi.fn(),
  ctor: vi.fn(),
}));
vi.mock('@azure/web-pubsub', () => ({
  WebPubSubServiceClient: class {
    constructor(...args: unknown[]) {
      sdk.ctor(...args);
    }
    getClientAccessToken = sdk.getClientAccessToken;
    group = () => ({ sendToAll: sdk.sendToAll });
  },
}));

import { negotiateShopConnection, publishToShop, resetWebPubSubClient } from '../../../src/infrastructure/realtime/webPubSub';

describe('webPubSub', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetWebPubSubClient();
    delete process.env.WEB_PUBSUB_CONNECTION_STRING;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('unconfigured: negotiate is null and publish is a no-op', async () => {
    expect(await negotiateShopConnection('shop-1', 'u1')).toBeNull();
    await publishToShop('shop-1', { type: 'new-order' });
    expect(sdk.ctor).not.toHaveBeenCalled();
  });

  it('configured: mints a token for the shop group on the orders hub', async () => {
    process.env.WEB_PUBSUB_CONNECTION_STRING = 'Endpoint=https://x;AccessKey=k;Version=1.0;';
    sdk.getClientAccessToken.mockResolvedValue({ url: 'wss://x/client/hubs/orders?access_token=t', token: 't', baseUrl: 'wss://x' });
    expect(await negotiateShopConnection('shop-1', 'u1')).toEqual({ url: 'wss://x/client/hubs/orders?access_token=t', accessToken: 't' });
    expect(sdk.ctor).toHaveBeenCalledWith(process.env.WEB_PUBSUB_CONNECTION_STRING, 'orders');
    expect(sdk.getClientAccessToken).toHaveBeenCalledWith({ userId: 'u1', groups: ['shop-1'], expirationTimeInMinutes: 60 });
  });

  it('publish sends to the group and swallows errors', async () => {
    process.env.WEB_PUBSUB_CONNECTION_STRING = 'Endpoint=https://x;AccessKey=k;Version=1.0;';
    await publishToShop('shop-1', { type: 'new-order', orderId: 'o1' });
    expect(sdk.sendToAll).toHaveBeenCalledWith({ type: 'new-order', orderId: 'o1' });
    sdk.sendToAll.mockRejectedValue(new Error('boom'));
    await expect(publishToShop('shop-1', {})).resolves.toBeUndefined();
  });
});
