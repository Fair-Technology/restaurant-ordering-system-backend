/**
 * Tells a platform operator that Stripe is refusing the platform's own key or account setup.
 *
 * Why it exists: a restricted key that lost a permission makes every card order fail at capture, the hold is
 * released and the diner is told their payment failed, while nobody else hears about it.
 *
 * Channels, in order of reliability:
 *  1. A single `[alert:platform]` log line, written EVERY time (it is what the Azure Monitor rule matches).
 *     It says whether the email went out, so the log alone is enough to see the state.
 *  2. An email to PLATFORM_ALERT_EMAIL, at most one per window per process. If the email cannot be sent
 *     (no recipient, or EMAIL_TRANSPORT is not `acs` and fully configured) that is logged as an error with
 *     `[alert:platform:undeliverable]`, never skipped silently.
 *
 * The rate limit is in memory: a Functions host is stateless, but a bad key then costs at most one email per
 * instance per window, which is bounded and needs no extra store (a persisted limiter would add a Cosmos
 * read/write to an already failing path). Nothing here throws.
 */
import { emailTransportName, sendEmail } from '../email/emailSender';
import { diagnoseStripeError } from './stripeErrorDiagnostics';

export const ALERT_WINDOW_MS = 15 * 60 * 1000;

export type AlertOutcome = 'not_alertable' | 'sent' | 'suppressed' | 'undeliverable' | 'failed';

let lastSentAt: number | null = null;

/** Test hook. */
export function resetPlatformAlertState(): void {
  lastSentAt = null;
}

export async function alertOnStripeConfigFailure(
  operation: string,
  err: unknown,
  refs: Record<string, string | undefined> = {},
  now: number = Date.now(),
): Promise<AlertOutcome> {
  try {
    const d = diagnoseStripeError(err);
    if (d.kind !== 'permission_or_config') return 'not_alertable';

    const detail = `op=${operation} type=${d.type ?? '-'} code=${d.code ?? '-'} status=${d.statusCode ?? '-'}` +
      (d.requestId ? ` requestId=${d.requestId}` : '');
    const suppressed = lastSentAt !== null && now - lastSentAt < ALERT_WINDOW_MS;
    const recipient = process.env.PLATFORM_ALERT_EMAIL?.trim();

    let outcome: AlertOutcome;
    let why = '';
    if (suppressed) {
      outcome = 'suppressed';
    } else if (!recipient) {
      outcome = 'undeliverable';
      why = ' reason=PLATFORM_ALERT_EMAIL_not_set';
    } else if (emailTransportName() !== 'acs') {
      outcome = 'undeliverable';
      why = ' reason=EMAIL_TRANSPORT_not_acs_or_ACS_settings_missing';
    } else {
      outcome = 'sent'; // provisional; downgraded below if the send throws
    }

    if (outcome === 'sent') {
      lastSentAt = now;
      try {
        await sendEmail(buildAlertEmail(detail, refs, recipient as string));
      } catch (sendErr: unknown) {
        outcome = 'failed';
        why = ` reason=send_threw:${sendErr instanceof Error ? sendErr.name : 'unknown'}`;
      }
    } else if (outcome === 'undeliverable') {
      lastSentAt = now; // one loud line per window, not one per failed order
    }

    const line = `[alert:platform] kind=stripe_permission_or_config ${detail} notified=${outcome}${why}`;
    if (outcome === 'undeliverable' || outcome === 'failed') {
      console.error(`[alert:platform:undeliverable] NO PLATFORM OPERATOR WAS EMAILED. ${line}`);
    } else {
      console.error(line);
    }
    return outcome;
  } catch (e: unknown) {
    console.error('[alert:platform:undeliverable] alerting itself failed', e instanceof Error ? e.name : 'unknown');
    return 'failed';
  }
}

function buildAlertEmail(detail: string, refs: Record<string, string | undefined>, to: string) {
  const refText = Object.entries(refs)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');
  const text =
    `Stripe is refusing the platform's key or account setup. Card orders are being rejected at capture ` +
    `and their holds released; diners are told their payment failed.\n\n${detail}\n${refText}\n\n` +
    `Next step: docs/prod-runbook.md, "Alert: Stripe permission or configuration failure". ` +
    `At most one of these emails is sent per ${ALERT_WINDOW_MS / 60000} minutes per instance.`;
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return {
    to: [to],
    subject: '[ALERT] Stripe key/config failure: card orders are being rejected',
    text,
    html: `<pre>${esc(text)}</pre>`,
    replyTo: null,
    tag: 'platform_alert_stripe_config',
  };
}
