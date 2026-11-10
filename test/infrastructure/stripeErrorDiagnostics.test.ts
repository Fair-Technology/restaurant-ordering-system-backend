import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  diagnoseStripeError,
  formatStripeFailure,
  logStripeFailure,
} from '../../src/infrastructure/stripe/stripeErrorDiagnostics';

const permissionError = {
  type: 'StripePermissionError',
  rawType: 'invalid_request_error',
  code: 'more_permissions_required',
  statusCode: 403,
  requestId: 'req_perm1',
  message: 'This API call cannot be made with this restricted key',
};
const cardDecline = {
  type: 'StripeCardError',
  rawType: 'card_error',
  code: 'card_declined',
  decline_code: 'insufficient_funds',
  statusCode: 402,
  requestId: 'req_card1',
};

afterEach(() => vi.restoreAllMocks());

describe('diagnoseStripeError', () => {
  it('more_permissions_required is distinguishable from a genuine card decline', () => {
    const perm = diagnoseStripeError(permissionError);
    const card = diagnoseStripeError(cardDecline);
    expect(perm).toMatchObject({ kind: 'permission_or_config', code: 'more_permissions_required', requestId: 'req_perm1' });
    expect(card).toMatchObject({ kind: 'card_decline', code: 'card_declined', declineCode: 'insufficient_funds' });
    expect(formatStripeFailure('capture', permissionError)).not.toEqual(formatStripeFailure('capture', cardDecline));
  });
  it('reads the fields from err.raw when they are not top level', () => {
    expect(diagnoseStripeError({ raw: { code: 'more_permissions_required', statusCode: 403 } }).kind).toBe('permission_or_config');
  });
  it('classifies outages as transient and unknown things as other', () => {
    expect(diagnoseStripeError({ type: 'StripeConnectionError' }).kind).toBe('transient');
    expect(diagnoseStripeError(new Error('boom')).kind).toBe('other');
    expect(diagnoseStripeError(undefined).kind).toBe('other');
  });
});

describe('logStripeFailure', () => {
  it('logs type, code, decline_code and request id on one line', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    logStripeFailure('capture', cardDecline, { orderId: 'o1' });
    const line = String(spy.mock.calls[0][0]);
    expect(line).toContain('type=StripeCardError');
    expect(line).toContain('code=card_declined');
    expect(line).toContain('declineCode=insufficient_funds');
    expect(line).toContain('requestId=req_card1');
    expect(line).toContain('orderId=o1');
  });
});
