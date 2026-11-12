import { describe, expect, it } from 'vitest';
import { errorBrief } from '../../src/application/_shared/errorBrief';

describe('errorBrief', () => {
  it('names the error, its code and message on one line', () => {
    expect(errorBrief(Object.assign(new Error('a\nb'), { code: 'X1' }))).toBe('Error[X1]: a b');
  });
  it('prefers the Stripe type', () => {
    expect(errorBrief({ type: 'StripePermissionError', code: 'more_permissions_required', message: 'no' })).toBe(
      'StripePermissionError[more_permissions_required]: no',
    );
  });
  it('handles non-errors', () => {
    expect(errorBrief(undefined)).toBe('unknown error');
    expect(errorBrief('boom')).toBe('boom');
  });
  it('caps the length and omits the stack', () => {
    const out = errorBrief(new Error('x'.repeat(1000)));
    expect(out.length).toBeLessThanOrEqual(241);
    expect(out).not.toContain(' at ');
  });
});
