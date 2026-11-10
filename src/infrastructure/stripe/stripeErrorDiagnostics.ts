/**
 * Makes a failed Stripe call diagnosable. A key that lacks a permission, a misconfigured account and a
 * genuinely declined card all end the same way for the diner (declined, rejected, reservation released), so
 * the log line is the only place an operator can tell them apart. Pure: no Stripe import, no secrets.
 */

export type StripeFailureKind =
  | 'permission_or_config' // key or account cannot do this: fix the setup, the diner did nothing wrong
  | 'card_decline' // the card issuer refused: a real decline
  | 'transient' // network, Stripe 5xx, rate limit: worth retrying
  | 'other';

export interface StripeErrorDiagnosis {
  kind: StripeFailureKind;
  /** stripe-node class name, e.g. StripePermissionError, StripeCardError. */
  type: string | null;
  /** Stripe's raw type, e.g. invalid_request_error, card_error. */
  rawType: string | null;
  code: string | null;
  declineCode: string | null;
  statusCode: number | null;
  requestId: string | null;
}

interface StripeErrorShape {
  type?: unknown;
  rawType?: unknown;
  code?: unknown;
  decline_code?: unknown;
  statusCode?: unknown;
  requestId?: unknown;
  raw?: { type?: unknown; code?: unknown; decline_code?: unknown; statusCode?: unknown; requestId?: unknown };
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);

const PERMISSION_CODES = new Set(['more_permissions_required', 'platform_api_key_expired', 'api_key_expired']);
const TRANSIENT_TYPES = new Set(['StripeConnectionError', 'StripeAPIError', 'StripeRateLimitError']);

export function diagnoseStripeError(err: unknown): StripeErrorDiagnosis {
  const e: StripeErrorShape = typeof err === 'object' && err !== null ? (err as StripeErrorShape) : {};
  const type = str(e.type);
  const rawType = str(e.rawType) ?? str(e.raw?.type);
  const code = str(e.code) ?? str(e.raw?.code);
  const declineCode = str(e.decline_code) ?? str(e.raw?.decline_code);
  const statusCode = num(e.statusCode) ?? num(e.raw?.statusCode);
  const requestId = str(e.requestId) ?? str(e.raw?.requestId);

  let kind: StripeFailureKind = 'other';
  if (
    type === 'StripePermissionError' ||
    type === 'StripeAuthenticationError' ||
    (code !== null && PERMISSION_CODES.has(code)) ||
    statusCode === 403 ||
    statusCode === 401
  ) {
    kind = 'permission_or_config';
  } else if (type === 'StripeCardError' || rawType === 'card_error' || declineCode !== null) {
    kind = 'card_decline';
  } else if (type !== null && TRANSIENT_TYPES.has(type)) {
    kind = 'transient';
  }
  return { kind, type, rawType, code, declineCode, statusCode, requestId };
}

/**
 * One greppable line per failure: `[stripe:failure] op=capture kind=permission_or_config type=... code=...`.
 * Ids passed in are opaque references (order, payment intent), never keys or card data.
 */
export function formatStripeFailure(
  operation: string,
  err: unknown,
  refs: Record<string, string | undefined> = {},
): string {
  const d = diagnoseStripeError(err);
  const fields: Array<[string, string | number | null | undefined]> = [
    ['op', operation],
    ['kind', d.kind],
    ['type', d.type],
    ['rawType', d.rawType],
    ['code', d.code],
    ['declineCode', d.declineCode],
    ['status', d.statusCode],
    ['requestId', d.requestId],
    ...Object.entries(refs),
  ];
  return `[stripe:failure] ${fields.filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => `${k}=${v}`).join(' ')}`;
}

export function logStripeFailure(
  operation: string,
  err: unknown,
  refs: Record<string, string | undefined> = {},
): StripeErrorDiagnosis {
  console.error(formatStripeFailure(operation, err, refs));
  return diagnoseStripeError(err);
}
