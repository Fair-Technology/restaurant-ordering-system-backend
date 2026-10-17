import { beforeEach, describe, expect, it, vi } from 'vitest';

const { patch, create } = vi.hoisted(() => ({ patch: vi.fn(), create: vi.fn() }));
vi.mock('../../src/infrastructure/cosmos/cosmosClient', () => ({
  usageContainer: { item: () => ({ patch }), items: { create } },
}));

import { incrementMissedStreak, resetMissedStreak } from '../../src/infrastructure/cosmos/usage/CosmosMissedOrdersRepository';

const now = new Date('2026-10-05T10:10:00Z');
const NOW_ISO = '2026-10-05T10:10:00.000Z';

describe('missed-orders repository', () => {
  beforeEach(() => {
    patch.mockReset();
    create.mockReset();
  });

  it('counts with one atomic patch', async () => {
    patch.mockResolvedValue({ resource: { streak: 4 } });
    expect(await incrementMissedStreak('shop-1', now)).toBe(4);
    expect(patch).toHaveBeenCalledWith([
      { op: 'incr', path: '/streak', value: 1 },
      { op: 'set', path: '/updatedAt', value: NOW_ISO },
    ]);
    expect(create).not.toHaveBeenCalled();
  });

  it('the first miss creates the record', async () => {
    patch.mockRejectedValue({ code: 404 });
    create.mockResolvedValue({});
    expect(await incrementMissedStreak('shop-1', now)).toBe(1);
    expect(create).toHaveBeenCalledWith({
      id: 'missed_orders_shop-1',
      kind: 'missed_orders',
      shopId: 'shop-1',
      streak: 1,
      updatedAt: NOW_ISO,
    });
  });

  it('two first misses at once: the second one counts on top', async () => {
    patch.mockRejectedValueOnce({ code: 404 }).mockResolvedValueOnce({ resource: { streak: 2 } });
    create.mockRejectedValue({ code: 409 });
    expect(await incrementMissedStreak('shop-1', now)).toBe(2);
  });

  it('resetting a shop with no record does nothing', async () => {
    patch.mockRejectedValue({ code: 404 });
    await expect(resetMissedStreak('shop-1', now)).resolves.toBeUndefined();
  });

  it('other errors are not swallowed', async () => {
    patch.mockRejectedValue({ code: 503 });
    await expect(incrementMissedStreak('shop-1', now)).rejects.toBeDefined();
  });
});
