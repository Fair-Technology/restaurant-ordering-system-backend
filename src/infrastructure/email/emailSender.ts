import { EmailClient } from '@azure/communication-email';
import { isPlatformEmailEnabled } from './emailGate';

export interface EmailAttachment {
  name: string;
  contentType: string;
  contentInBase64: string;
}

export interface OutgoingEmail {
  to: string[];
  subject: string;
  text: string;
  html: string;
  replyTo: string | null;
  attachments?: EmailAttachment[];
  tag: string; // what kind of email this is; the only thing the log transport prints
}

/** 'acs' only when explicitly selected and fully configured; otherwise every email is just logged. */
export function emailTransportName(): 'acs' | 'log' {
  return process.env.EMAIL_TRANSPORT === 'acs' && process.env.ACS_EMAIL_CONNECTION_STRING && process.env.ACS_EMAIL_SENDER
    ? 'acs'
    : 'log';
}

/**
 * ACS answers 429 (rate limit) with Retry-After. The SDK's default retry honours it for up to a minute,
 * which would hold an order request open, so: one retry, at most 2 s of back-off, and a hard overall cap.
 */
export const EMAIL_SEND_TIMEOUT_MS = 5000;
const EMAIL_RETRY_OPTIONS = { maxRetries: 1, retryDelayInMs: 500, maxRetryDelayInMs: 2000 };

/**
 * The ONE place the platform email switch is checked: every order/restaurant email goes through here.
 * Platform-operator alerts pass `bypassPlatformSwitch`.
 */
export async function sendEmail(email: OutgoingEmail, options: { bypassPlatformSwitch?: boolean } = {}): Promise<void> {
  if (!options.bypassPlatformSwitch && !(await isPlatformEmailEnabled())) {
    console.info('[email:disabled]', email.tag, `${email.to.length} recipient(s)`);
    return;
  }
  if (emailTransportName() === 'log') {
    // Never the body or the addresses: they are personal data.
    console.info('[email:log]', email.tag, `${email.to.length} recipient(s)`);
    return;
  }
  const client = new EmailClient(process.env.ACS_EMAIL_CONNECTION_STRING as string, { retryOptions: EMAIL_RETRY_OPTIONS });
  // beginSend only: the service accepts the message here; waiting for delivery (pollUntilDone) would hold the request open.
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('email send timed out')), EMAIL_SEND_TIMEOUT_MS);
  });
  try {
    const sending = send(client, email);
    sending.catch(() => undefined); // if the timeout wins, a late rejection must not go unhandled
    await Promise.race([sending, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function send(client: EmailClient, email: OutgoingEmail) {
  return client.beginSend({
    senderAddress: process.env.ACS_EMAIL_SENDER as string,
    attachments: email.attachments?.length ? email.attachments : undefined,
    content: { subject: email.subject, plainText: email.text, html: email.html },
    recipients: { to: email.to.map((address) => ({ address })) },
    replyTo: email.replyTo ? [{ address: email.replyTo }] : undefined,
  });
}
