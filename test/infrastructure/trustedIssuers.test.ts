import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { trustedIssuers } from '../../src/infrastructure/auth/trustedIssuers';

// These tests cover configuration only — no tokens, no network. Signature and
// audience checking is jose's job and is exercised through the gate tests.

const KEYS = [
  'ENTRA_TENANT_NAME',
  'ENTRA_TENANT_ID',
  'ENTRA_CLIENT_ID',
  'WORKFORCE_TENANT_ID',
  'WORKFORCE_API_CLIENT_ID',
] as const;

describe('trustedIssuers', () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  const setCiam = () => {
    process.env.ENTRA_TENANT_NAME = 'restaurantorderingdev';
    process.env.ENTRA_TENANT_ID = '47342614-e039-456f-9fa5-9a4754e16ae5';
    process.env.ENTRA_CLIENT_ID = 'customer-api-client';
  };

  it('accepts nothing when no issuer is configured', () => {
    expect(trustedIssuers()).toEqual([]);
  });

  it('accepts only the customer tenant when workforce settings are absent', () => {
    setCiam();
    const issuers = trustedIssuers();
    expect(issuers).toHaveLength(1);
    expect(issuers[0].kind).toBe('customer');
    // CIAM issuers use the tenant ID as the subdomain; the tenant *name* is only
    // used to fetch the key set.
    expect(issuers[0].issuer).toBe(
      'https://47342614-e039-456f-9fa5-9a4754e16ae5.ciamlogin.com/47342614-e039-456f-9fa5-9a4754e16ae5/v2.0',
    );
    expect(issuers[0].jwksUrl).toBe(
      'https://restaurantorderingdev.ciamlogin.com/47342614-e039-456f-9fa5-9a4754e16ae5/discovery/v2.0/keys',
    );
  });

  it('adds the workforce tenant as a second issuer when configured', () => {
    setCiam();
    process.env.WORKFORCE_TENANT_ID = '8d4c1fdb-6961-456c-8e29-96e7d93f62c1';
    process.env.WORKFORCE_API_CLIENT_ID = '9b3447d9-638f-4a12-badf-87596b3b40e3';

    const issuers = trustedIssuers();
    expect(issuers.map((i) => i.kind)).toEqual(['customer', 'platform']);
    const platform = issuers[1];
    // Workforce tenants live on login.microsoftonline.com, not ciamlogin.com.
    expect(platform.issuer).toBe(
      'https://login.microsoftonline.com/8d4c1fdb-6961-456c-8e29-96e7d93f62c1/v2.0',
    );
    expect(platform.audience).toBe('9b3447d9-638f-4a12-badf-87596b3b40e3');
  });

  it('ignores a half-configured workforce tenant', () => {
    setCiam();
    process.env.WORKFORCE_TENANT_ID = '8d4c1fdb-6961-456c-8e29-96e7d93f62c1';
    expect(trustedIssuers().map((i) => i.kind)).toEqual(['customer']);
  });
});
