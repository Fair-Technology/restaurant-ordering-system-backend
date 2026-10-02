import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@azure/communication-email', () => ({ EmailClient: vi.fn() }));

import { EmailClient } from '@azure/communication-email';
import { emailTransportName, sendEmail } from '../../src/infrastructure/email/emailSender';

const KEYS = ['EMAIL_TRANSPORT', 'ACS_EMAIL_CONNECTION_STRING', 'ACS_EMAIL_SENDER'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  vi.clearAllMocks();
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('emailSender', () => {
  it('log transport is the default', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    expect(emailTransportName()).toBe('log');
    await expect(
      sendEmail({ to: ['a@example.com'], subject: 's', text: 't', html: 'h', replyTo: null, tag: 'order_received' }),
    ).resolves.toBeUndefined();
    expect(EmailClient).not.toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain('a@example.com');
    log.mockRestore();
  });

  it('acs without a connection string falls back to log', () => {
    process.env.EMAIL_TRANSPORT = 'acs';
    expect(emailTransportName()).toBe('log');
  });
});
