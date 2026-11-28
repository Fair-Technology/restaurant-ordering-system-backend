import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ query: vi.fn(), create: vi.fn(), read: vi.fn(), replace: vi.fn() }));
vi.mock('../../src/infrastructure/cosmos/cosmosClient', () => ({
  planContainer: {
    items: { query: h.query, create: h.create },
    item: () => ({ read: h.read, replace: h.replace }),
  },
}));

import {
  findPlanById,
  findDefaultPlan,
  findAllPlans,
  findVisiblePlans,
  createPlan,
  updatePlan,
} from '../../src/infrastructure/cosmos/plan/CosmosPlanRepository';

const META = { _rid: 'r', _self: 's', _etag: 'e', _attachments: 'a/', _ts: 1 };
const noMeta = (o: object) => { for (const k of Object.keys(META)) expect(o).not.toHaveProperty(k); };
const rows = () => ({ fetchAll: async () => ({ resources: [{ id: 'p1', ...META }, { id: 'p2', ...META }] }) });

beforeEach(() => vi.resetAllMocks());

describe('CosmosPlanRepository strips Cosmos metadata', () => {
  it('findPlanById (and null on 404)', async () => {
    h.read.mockResolvedValueOnce({ resource: { id: 'p1', ...META } });
    const p = await findPlanById('p1');
    expect(p?.id).toBe('p1');
    noMeta(p!);
    h.read.mockRejectedValueOnce({ code: 404 });
    expect(await findPlanById('x')).toBeNull();
  });

  it('findDefaultPlan (and null when empty)', async () => {
    h.query.mockReturnValueOnce(rows());
    const p = await findDefaultPlan();
    expect(p?.id).toBe('p1');
    noMeta(p!);
    h.query.mockReturnValueOnce({ fetchAll: async () => ({ resources: [] }) });
    expect(await findDefaultPlan()).toBeNull();
  });

  it('findAllPlans', async () => {
    h.query.mockReturnValueOnce(rows());
    const ps = await findAllPlans();
    expect(ps).toHaveLength(2);
    ps.forEach(noMeta);
  });

  it('findVisiblePlans', async () => {
    h.query.mockReturnValueOnce(rows());
    const ps = await findVisiblePlans();
    expect(ps).toHaveLength(2);
    ps.forEach(noMeta);
  });

  it('createPlan', async () => {
    h.create.mockResolvedValue({ resource: { id: 'p1', ...META } });
    const p = await createPlan({ id: 'p1' } as any);
    expect(p.id).toBe('p1');
    noMeta(p);
  });

  it('updatePlan', async () => {
    h.replace.mockResolvedValue({ resource: { id: 'p1', ...META } });
    const p = await updatePlan({ id: 'p1' } as any);
    expect(p.id).toBe('p1');
    noMeta(p);
  });
});
