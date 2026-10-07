import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/infrastructure/cosmos/user/CosmosUserRepository', () => ({ findUserById: vi.fn() }));

import { findUserById } from '../../../src/infrastructure/cosmos/user/CosmosUserRepository';
import { buildOrderLimitEmail, ownerRecipients } from '../../../src/application/usage/orderLimitWarnings';
import { CARD_SHOP } from '../../fixtures/orders';

describe('buildOrderLimitEmail', () => {
  const shop = { name: 'Ma Pasta', menuLanguages: ['en' as const] };
  const subscriptionUrl = 'https://admin.example/shops/shop-1/subscription';

  it('writes the warning in English for an English restaurant', () => {
    const mail = buildOrderLimitEmail({ shop, level: 90, count: 27, limit: 30, subscriptionUrl });
    expect(mail.subject).toBe('Ma Pasta: 90% of your monthly order limit used');
    expect(mail.text).toContain('27 of 30 orders accepted this month.');
    expect(mail.text).toContain(`Change plan: ${subscriptionUrl}`);
  });

  it('says ordering is paused at the limit', () => {
    const mail = buildOrderLimitEmail({ shop, level: 100, count: 30, limit: 30, subscriptionUrl });
    expect(mail.subject).toBe('Ma Pasta: order limit reached – online ordering paused');
    expect(mail.text).toContain('takes no more online orders');
  });
});

describe('ownerRecipients', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists each active owner once, ignoring letter case', async () => {
    const shop = {
      ...CARD_SHOP,
      members: [
        { userId: 'u1', role: 'owner' as const, isActive: true },
        { userId: 'u2', role: 'owner' as const, isActive: true },
        { userId: 'u3', role: 'owner' as const, isActive: false },
      ],
    };
    (findUserById as any).mockImplementation(async (id: string) => ({
      id,
      systemRole: 'user',
      email: id === 'u2' ? 'OWNER@x.example' : id === 'u3' ? 'gone@x.example' : 'owner@x.example',
    }));
    expect(await ownerRecipients(shop)).toEqual(['owner@x.example']);
  });

  it('returns nothing when there is no owner address and no Impressum email', async () => {
    (findUserById as any).mockResolvedValue(null);
    expect(await ownerRecipients({ ...CARD_SHOP, legal: undefined })).toEqual([]);
  });
});
