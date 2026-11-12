import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/infrastructure/email/emailSender', () => ({
  emailTransportName: vi.fn(() => 'acs'),
  sendEmail: vi.fn(async () => undefined),
}));

import { emailTransportName, sendEmail } from '../../src/infrastructure/email/emailSender';
import {
  ALERT_WINDOW_MS,
  alertOnStripeConfigFailure,
  resetPlatformAlertState,
} from '../../src/infrastructure/stripe/platformAlert';

const permissionError = { type: 'StripePermissionError', code: 'more_permissions_required', statusCode: 403, requestId: 'req_1' };
const cardDecline = { type: 'StripeCardError', rawType: 'card_error', code: 'card_declined', decline_code: 'insufficient_funds', statusCode: 402 };

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  resetPlatformAlertState();
  process.env.PLATFORM_ALERT_EMAIL = 'ops@example.test';
  vi.mocked(emailTransportName).mockReturnValue('acs');
  vi.mocked(sendEmail).mockReset().mockResolvedValue(undefined);
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  delete process.env.PLATFORM_ALERT_EMAIL;
  vi.restoreAllMocks();
});

describe('alertOnStripeConfigFailure', () => {
  it('fires on permission_or_config: one email and a greppable log line', async () => {
    expect(await alertOnStripeConfigFailure('capture', permissionError, { orderId: 'o1' }, 1000)).toBe('sent');
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEmail).mock.calls[0][0].to).toEqual(['ops@example.test']);
    const line = String(errorSpy.mock.calls[0][0]);
    expect(line).toContain('[alert:platform] kind=stripe_permission_or_config op=capture');
    expect(line).toContain('code=more_permissions_required');
    expect(line).toContain('notified=sent');
  });

  it('does NOT fire on a card decline', async () => {
    expect(await alertOnStripeConfigFailure('capture', cardDecline, {}, 1000)).toBe('not_alertable');
    expect(sendEmail).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('does not fire on transient errors', async () => {
    expect(await alertOnStripeConfigFailure('capture', { type: 'StripeConnectionError' }, {}, 1000)).toBe('not_alertable');
  });

  it('is rate limited: repeats inside the window are suppressed, the next window sends again', async () => {
    await alertOnStripeConfigFailure('capture', permissionError, {}, 1000);
    for (let i = 1; i <= 50; i++) {
      expect(await alertOnStripeConfigFailure('capture', permissionError, {}, 1000 + i * 1000)).toBe('suppressed');
    }
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(await alertOnStripeConfigFailure('capture', permissionError, {}, 1000 + ALERT_WINDOW_MS)).toBe('sent');
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it('is loud when the email transport is not configured', async () => {
    vi.mocked(emailTransportName).mockReturnValue('log');
    expect(await alertOnStripeConfigFailure('capture', permissionError, {}, 1000)).toBe('undeliverable');
    expect(sendEmail).not.toHaveBeenCalled();
    expect(String(errorSpy.mock.calls[0][0])).toContain('[alert:platform:undeliverable] NO PLATFORM OPERATOR WAS EMAILED');
    expect(String(errorSpy.mock.calls[0][0])).toContain('EMAIL_TRANSPORT_not_acs');
  });

  it('is loud when PLATFORM_ALERT_EMAIL is not set', async () => {
    delete process.env.PLATFORM_ALERT_EMAIL;
    expect(await alertOnStripeConfigFailure('capture', permissionError, {}, 1000)).toBe('undeliverable');
    expect(String(errorSpy.mock.calls[0][0])).toContain('PLATFORM_ALERT_EMAIL_not_set');
  });

  it('never throws when the send fails, and says so', async () => {
    vi.mocked(sendEmail).mockRejectedValue(new Error('boom'));
    expect(await alertOnStripeConfigFailure('capture', permissionError, {}, 1000)).toBe('failed');
    expect(String(errorSpy.mock.calls[0][0])).toContain('[alert:platform:undeliverable]');
  });

  it('never puts secrets or the raw message in the email', async () => {
    await alertOnStripeConfigFailure('capture', { ...permissionError, message: 'key sk_live_SECRET' }, {}, 1000);
    expect(JSON.stringify(vi.mocked(sendEmail).mock.calls[0][0])).not.toContain('sk_live_SECRET');
  });
});
