import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/infrastructure/stripe/stripeClient', () => ({
  ensurePaymentMethodDomain: vi.fn(),
  storefrontDomainName: vi.fn(),
}));

import { registerStorefrontDomain } from '../../../src/application/shop/_shared/registerStorefrontDomain';
import {
  ensurePaymentMethodDomain,
  storefrontDomainName,
} from '../../../src/infrastructure/stripe/stripeClient';

describe('registerStorefrontDomain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (storefrontDomainName as any).mockReturnValue('shop.example');
    (ensurePaymentMethodDomain as any).mockResolvedValue('created');
  });

  it('registers the storefront domain on the restaurant account', async () => {
    await registerStorefrontDomain('acct_1');
    expect(ensurePaymentMethodDomain).toHaveBeenCalledWith('shop.example', 'acct_1');
  });

  it('does nothing for a local or unset storefront address', async () => {
    (storefrontDomainName as any).mockReturnValue(null);
    await registerStorefrontDomain('acct_1');
    expect(ensurePaymentMethodDomain).not.toHaveBeenCalled();
  });

  it('skips the call for a restricted key and logs once at info', async () => {
    vi.resetModules();
    const { registerStorefrontDomain: fresh } = await import(
      '../../../src/application/shop/_shared/registerStorefrontDomain'
    );
    const prev = process.env.STRIPE_SECRET_KEY;
    process.env.STRIPE_SECRET_KEY = 'rk_test_x';
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await fresh('acct_1');
    await fresh('acct_2');
    expect(ensurePaymentMethodDomain).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
    info.mockRestore();
    warn.mockRestore();
    if (prev === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = prev;
  });

  it('still registers for a standard key', async () => {
    const prev = process.env.STRIPE_SECRET_KEY;
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    await registerStorefrontDomain('acct_1');
    expect(ensurePaymentMethodDomain).toHaveBeenCalled();
    if (prev === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = prev;
  });

  it('never fails onboarding when Stripe refuses', async () => {
    (ensurePaymentMethodDomain as any).mockRejectedValue(new Error('boom'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(registerStorefrontDomain('acct_1')).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
