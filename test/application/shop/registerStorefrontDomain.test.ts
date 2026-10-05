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

  it('never fails onboarding when Stripe refuses', async () => {
    (ensurePaymentMethodDomain as any).mockRejectedValue(new Error('boom'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(registerStorefrontDomain('acct_1')).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
