import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const beginSend = vi.fn();
vi.mock('@azure/communication-email', () => ({ EmailClient: vi.fn(function (this: any) { this.beginSend = beginSend; }) }));
vi.mock('../../src/infrastructure/cosmos/system/CosmosSystemConfigRepository', () => ({ getSystemConfig: vi.fn() }));

import { EmailClient } from '@azure/communication-email';
import { getSystemConfig } from '../../src/infrastructure/cosmos/system/CosmosSystemConfigRepository';
import { isPlatformEmailEnabled } from '../../src/infrastructure/email/emailGate';
import { EMAIL_SEND_TIMEOUT_MS, sendEmail } from '../../src/infrastructure/email/emailSender';

const mail = { to: ['a@example.com'], subject: 's', text: 't', html: 'h', replyTo: null, tag: 'order_received' };
const ENV = ['EMAIL_TRANSPORT', 'ACS_EMAIL_CONNECTION_STRING', 'ACS_EMAIL_SENDER'] as const;
const saved: Record<string, string | undefined> = {};
const config = (emailEnabled: unknown) => vi.mocked(getSystemConfig).mockResolvedValue({ id: 'global', maxShopsDefault: 3, emailEnabled } as any);

beforeEach(() => {
  for (const k of ENV) saved[k] = process.env[k];
  process.env.EMAIL_TRANSPORT = 'acs';
  process.env.ACS_EMAIL_CONNECTION_STRING = 'endpoint=https://x/;accesskey=k';
  process.env.ACS_EMAIL_SENDER = 'noreply@example.test';
  vi.clearAllMocks();
  beginSend.mockResolvedValue({});
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('isPlatformEmailEnabled', () => {
  it('is true only for exactly true', async () => {
    config(true);
    expect(await isPlatformEmailEnabled()).toBe(true);
    config(undefined);
    expect(await isPlatformEmailEnabled()).toBe(false);
    config('true');
    expect(await isPlatformEmailEnabled()).toBe(false);
  });
  it('fails closed when the config read throws', async () => {
    vi.mocked(getSystemConfig).mockRejectedValue(new Error('cosmos down'));
    expect(await isPlatformEmailEnabled()).toBe(false);
  });
});

describe('sendEmail platform switch', () => {
  it('switch off: ACS is never invoked, even with the transport configured', async () => {
    config(false);
    await sendEmail(mail);
    expect(EmailClient).not.toHaveBeenCalled();
    expect(beginSend).not.toHaveBeenCalled();
  });
  it('config read failure: nothing is sent and nothing throws', async () => {
    vi.mocked(getSystemConfig).mockRejectedValue(new Error('cosmos down'));
    await expect(sendEmail(mail)).resolves.toBeUndefined();
    expect(beginSend).not.toHaveBeenCalled();
  });
  it('switch on + acs: ACS is invoked', async () => {
    config(true);
    await sendEmail(mail);
    expect(beginSend).toHaveBeenCalledTimes(1);
  });
  it('bypassPlatformSwitch sends even when the switch is off (and does not read the config)', async () => {
    config(false);
    await sendEmail(mail, { bypassPlatformSwitch: true });
    expect(beginSend).toHaveBeenCalledTimes(1);
    expect(getSystemConfig).not.toHaveBeenCalled();
  });
  it('bypass still respects an unconfigured transport (log only)', async () => {
    delete process.env.EMAIL_TRANSPORT;
    await sendEmail(mail, { bypassPlatformSwitch: true });
    expect(beginSend).not.toHaveBeenCalled();
  });
});

describe('sendEmail rate limiting', () => {
  it('builds the client with a short, capped retry policy', async () => {
    config(true);
    await sendEmail(mail);
    const options = vi.mocked(EmailClient).mock.calls[0][1] as any;
    expect(options.retryOptions.maxRetries).toBeLessThanOrEqual(2);
    expect(options.retryOptions.maxRetryDelayInMs).toBeLessThanOrEqual(5000);
  });
  it('a 429 rejection settles at once and surfaces to the caller (who already catches)', async () => {
    config(true);
    beginSend.mockRejectedValue(Object.assign(new Error('Too Many Requests'), { statusCode: 429, response: { headers: { 'retry-after': '60' } } }));
    const started = Date.now();
    await expect(sendEmail(mail)).rejects.toMatchObject({ statusCode: 429 });
    expect(Date.now() - started).toBeLessThan(1000);
  });
  it('a send stuck waiting out a Retry-After is cut off at the cap', async () => {
    vi.useFakeTimers();
    config(true);
    beginSend.mockReturnValue(new Promise(() => undefined)); // never settles
    const outcome = sendEmail(mail).then(() => 'ok', (e: Error) => e.message);
    await vi.advanceTimersByTimeAsync(EMAIL_SEND_TIMEOUT_MS + 1);
    expect(await outcome).toBe('email send timed out');
    expect(EMAIL_SEND_TIMEOUT_MS).toBeLessThanOrEqual(5000);
  });
});
