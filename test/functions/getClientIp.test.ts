import { describe, expect, it } from 'vitest';
import { getClientIp } from '../../src/functions/_shared/getClientIp';

const req = (xff?: string) =>
  ({ headers: new Headers(xff === undefined ? {} : { 'x-forwarded-for': xff }) }) as any;

describe('getClientIp', () => {
  it('returns undefined without the header', () => {
    expect(getClientIp(req())).toBeUndefined();
  });
  it('returns a single IPv4 as-is', () => {
    expect(getClientIp(req('1.2.3.4'))).toBe('1.2.3.4');
  });
  it('strips the port from IPv4:port', () => {
    expect(getClientIp(req('1.2.3.4:5678'))).toBe('1.2.3.4');
  });
  it('takes the first of several, trimmed', () => {
    expect(getClientIp(req('  1.2.3.4:5678 , 10.0.0.1:99, 10.0.0.2'))).toBe('1.2.3.4');
  });
  it('leaves a bare IPv6 unchanged', () => {
    expect(getClientIp(req('2001:db8::1'))).toBe('2001:db8::1');
  });
});
