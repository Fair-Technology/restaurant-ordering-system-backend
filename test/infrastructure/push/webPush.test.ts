import { beforeEach, describe, expect, it, vi } from 'vitest';

const wp = vi.hoisted(() => ({ setVapidDetails: vi.fn(), sendNotification: vi.fn() }));
vi.mock('web-push', () => ({ default: wp }));

import { pushPublicKey, sendPushNotification } from '../../../src/infrastructure/push/webPush';

const sub = { endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } };

describe('webPush', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_SUBJECT;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('unconfigured: no public key and sending fails without calling the library', async () => {
    expect(pushPublicKey()).toBeNull();
    expect(await sendPushNotification(sub, {})).toBe('failed');
    expect(wp.sendNotification).not.toHaveBeenCalled();
  });

  describe('configured', () => {
    beforeEach(() => {
      process.env.VAPID_PUBLIC_KEY = 'pub';
      process.env.VAPID_PRIVATE_KEY = 'priv';
      process.env.VAPID_SUBJECT = 'mailto:ops@example.com';
    });

    it('sends and reports sent', async () => {
      wp.sendNotification.mockResolvedValue({});
      expect(pushPublicKey()).toBe('pub');
      expect(await sendPushNotification(sub, { a: 1 })).toBe('sent');
      expect(wp.setVapidDetails).toHaveBeenCalledWith('mailto:ops@example.com', 'pub', 'priv');
      expect(wp.sendNotification).toHaveBeenCalledWith(sub, '{"a":1}');
    });

    it.each([404, 410])('%i means the subscription is gone', async (statusCode) => {
      wp.sendNotification.mockRejectedValue({ statusCode });
      expect(await sendPushNotification(sub, {})).toBe('gone');
    });

    it('other errors are failed, never thrown', async () => {
      wp.sendNotification.mockRejectedValue({ statusCode: 500 });
      expect(await sendPushNotification(sub, {})).toBe('failed');
    });
  });
});
