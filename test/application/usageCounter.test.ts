import { describe, it, expect } from 'vitest';
import { nextUsage } from '../../src/application/_shared/usageCounter';

describe('nextUsage', () => {
  it('first order creates the doc', () => {
    expect(nextUsage(null, 's1', '2026-09', new Date('2026-09-25T10:00:00Z'))).toEqual({
      id: 's1',
      shopId: 's1',
      periodKey: '2026-09',
      acceptedOrderCount: 1,
      lastReconciled: null,
      createdAt: '2026-09-25T10:00:00.000Z',
      updatedAt: '2026-09-25T10:00:00.000Z',
    });
  });

  it('same month increments', () => {
    const current = {
      id: 's1',
      shopId: 's1',
      periodKey: '2026-09',
      acceptedOrderCount: 4,
      lastReconciled: '2026-09-10T00:00:00.000Z',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-20T00:00:00.000Z',
    };
    const result = nextUsage(current, 's1', '2026-09', new Date('2026-09-25T10:00:00Z'));
    expect(result.acceptedOrderCount).toBe(5);
    expect(result.createdAt).toBe('2026-09-01T00:00:00.000Z');
    expect(result.lastReconciled).toBe('2026-09-10T00:00:00.000Z');
  });

  it('new month resets', () => {
    const current = {
      id: 's1',
      shopId: 's1',
      periodKey: '2026-08',
      acceptedOrderCount: 30,
      lastReconciled: null,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-30T00:00:00.000Z',
    };
    const result = nextUsage(current, 's1', '2026-09', new Date('2026-09-25T10:00:00Z'));
    expect(result.acceptedOrderCount).toBe(1);
    expect(result.periodKey).toBe('2026-09');
  });
});
