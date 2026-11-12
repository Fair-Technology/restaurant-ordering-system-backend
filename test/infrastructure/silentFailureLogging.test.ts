import { afterEach, describe, expect, it, vi } from 'vitest';
import { mapResultToHttp } from '../../src/functions/_shared/mapResultToHttp';
import { internalServerError } from '../../src/functions/_shared/internalServerError';
import { logAuthFailure } from '../../src/infrastructure/auth/logAuthFailure';
import { logServiceFailure } from '../../src/application/_shared/logServiceFailure';

afterEach(() => vi.restoreAllMocks());
const spy = () => vi.spyOn(console, 'error').mockImplementation(() => {});

describe('silent-failure logging never changes the outcome', () => {
  it('mapResultToHttp logs the code on an unmapped result and still returns the same 500', () => {
    const log = spy();
    const res = mapResultToHttp({ ok: false, code: 'INTERNAL_ERROR', error: 'Failed to accept order' });
    expect(res).toEqual({ status: 500, jsonBody: { error: 'Internal server error' } });
    expect(log.mock.calls[0][0]).toContain('code=INTERNAL_ERROR');
  });

  it('mapped codes do not log', () => {
    const log = spy();
    expect(mapResultToHttp({ ok: false, code: 'NOT_FOUND', error: 'x' }).status).toBe(404);
    expect(log).not.toHaveBeenCalled();
  });

  it('internalServerError logs the cause and returns the bare 500', () => {
    const log = spy();
    const res = internalServerError('checkout', Object.assign(new Error('boom'), { type: 'StripePermissionError' }));
    expect(res).toEqual({ status: 500, jsonBody: { error: 'Internal server error' } });
    const lines = log.mock.calls.map((c) => c[0]).join('\n');
    expect(lines).toContain('handler=checkout');
    expect(lines).toContain('boom');
    expect(lines).toContain('[stripe:failure]');
  });

  it('logAuthFailure stays quiet for an ordinary bad credential and speaks for anything else', () => {
    const log = spy();
    logAuthFailure('x', new Error('Authentication required'));
    expect(log).not.toHaveBeenCalled();
    logAuthFailure('requirePlatform', new Error('STAFF_JWT_SECRET is not configured'));
    expect(log.mock.calls[0][0]).toContain('site=requirePlatform');
    expect(log.mock.calls[0][0]).toContain('STAFF_JWT_SECRET is not configured');
  });

  it('logServiceFailure logs a plain error on one line', () => {
    const log = spy();
    logServiceFailure('AcceptOrder', new Error('cosmos down'));
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toContain('site=AcceptOrder');
  });
});
