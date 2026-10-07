import { describe, it, expect } from 'vitest';
import { crossedLevels, currentAcceptedCount, orderLimitStatus, thresholdCount } from '../../src/domain/usage/orderLimit';

describe('orderLimit', () => {
  it('threshold counts round up', () => {
    expect(thresholdCount(30, 80)).toBe(24);
    expect(thresholdCount(30, 90)).toBe(27);
    expect(thresholdCount(30, 95)).toBe(29);
    expect(thresholdCount(300, 95)).toBe(285);
  });

  it('warning levels for a limit of 30', () => {
    const level = (c: number) => orderLimitStatus(c, 30, '2026-10').warningLevel;
    expect([23, 24, 27, 29].map(level)).toEqual([0, 80, 90, 95]);
  });

  it('the limit is reached at exactly the limit', () => {
    expect(orderLimitStatus(30, 30, '2026-10')).toMatchObject({ warningLevel: 100, limitReached: true });
    expect(orderLimitStatus(31, 30, '2026-10').limitReached).toBe(true);
    expect(orderLimitStatus(29, 30, '2026-10').limitReached).toBe(false);
  });

  it('unlimited never warns or stops', () => {
    expect(orderLimitStatus(500, null, '2026-10')).toEqual({
      acceptedOrderCount: 500,
      limit: null,
      warningLevel: 0,
      limitReached: false,
      periodKey: '2026-10',
    });
    expect(orderLimitStatus(0, 0, '2026-10').limitReached).toBe(true);
  });

  it("last month's count reads as zero", () => {
    const usage = { periodKey: '2026-09', acceptedOrderCount: 12 };
    expect(currentAcceptedCount(usage, '2026-10')).toBe(0);
    expect(currentAcceptedCount(usage, '2026-09')).toBe(12);
    expect(currentAcceptedCount(null, '2026-10')).toBe(0);
  });

  it('crossing detection', () => {
    expect(crossedLevels(23, 24, 30)).toEqual([80]);
    expect(crossedLevels(24, 25, 30)).toEqual([]);
    expect(crossedLevels(29, 30, 30)).toEqual([100]);
    expect(crossedLevels(2, 3, 3)).toEqual([80, 90, 95, 100]);
    expect(crossedLevels(5, 6, null)).toEqual([]);
  });
});
