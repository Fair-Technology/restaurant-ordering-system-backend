import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ query: vi.fn(), upsert: vi.fn() }));
vi.mock('../../src/infrastructure/cosmos/cosmosClient', () => ({
  planPricingContainer: { items: { query: h.query, upsert: h.upsert } },
}));

import {
  findPricingByPlan,
  findPricingByPlanAndCurrency,
  upsertPricing,
  findPricingByBillingPriceId,
} from '../../src/infrastructure/cosmos/plan/CosmosPlanPricingRepository';

const META = { _rid: 'r', _self: 's', _etag: 'e', _attachments: 'a/', _ts: 1 };
const noMeta = (o: object) => { for (const k of Object.keys(META)) expect(o).not.toHaveProperty(k); };
const rows = () => ({ fetchAll: async () => ({ resources: [{ id: 'x1', ...META }, { id: 'x2', ...META }] }) });
const empty = () => ({ fetchAll: async () => ({ resources: [] }) });

beforeEach(() => vi.resetAllMocks());

describe('CosmosPlanPricingRepository strips Cosmos metadata', () => {
  it('findPricingByPlan', async () => {
    h.query.mockReturnValueOnce(rows());
    const r = await findPricingByPlan('p1');
    expect(r).toHaveLength(2);
    r.forEach(noMeta);
  });

  it('findPricingByPlanAndCurrency (and null when empty)', async () => {
    h.query.mockReturnValueOnce(rows());
    const r = await findPricingByPlanAndCurrency('p1', 'eur');
    expect(r?.id).toBe('x1');
    noMeta(r!);
    h.query.mockReturnValueOnce(empty());
    expect(await findPricingByPlanAndCurrency('p1', 'usd')).toBeNull();
  });

  it('upsertPricing', async () => {
    h.upsert.mockResolvedValue({ resource: { id: 'x1', ...META } });
    const r = await upsertPricing({ id: 'x1' } as any);
    expect(r.id).toBe('x1');
    noMeta(r);
  });

  it('findPricingByBillingPriceId (and null when empty)', async () => {
    h.query.mockReturnValueOnce(rows());
    const r = await findPricingByBillingPriceId('price_1');
    expect(r?.id).toBe('x1');
    noMeta(r!);
    h.query.mockReturnValueOnce(empty());
    expect(await findPricingByBillingPriceId('none')).toBeNull();
  });
});
