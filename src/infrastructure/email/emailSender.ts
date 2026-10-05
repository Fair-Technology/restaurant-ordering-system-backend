import { EmailClient } from '@azure/communication-email';

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

export async function sendEmail(email: OutgoingEmail): Promise<void> {
  if (emailTransportName() === 'log') {
    // Never the body or the addresses: they are personal data.
    console.info('[email:log]', email.tag, `${email.to.length} recipient(s)`);
    return;
  }
  const client = new EmailClient(process.env.ACS_EMAIL_CONNECTION_STRING as string);
  // beginSend only: the service accepts the message here; waiting for delivery (pollUntilDone) would hold the request open.
  await client.beginSend({
    senderAddress: process.env.ACS_EMAIL_SENDER as string,
    attachments: email.attachments?.length ? email.attachments : undefined,
    content: { subject: email.subject, plainText: email.text, html: email.html },
    recipients: { to: email.to.map((address) => ({ address })) },
    replyTo: email.replyTo ? [{ address: email.replyTo }] : undefined,
  });
}
