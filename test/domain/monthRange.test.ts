import { describe, expect, it } from 'vitest';
import { isMonthKey, monthRangeUtc } from '../../src/domain/invoice/monthRange';

describe('isMonthKey', () => {
  it('accepts YYYY-MM only', () => {
    expect(isMonthKey('2026-10')).toBe(true);
    expect(isMonthKey('2026-12')).toBe(true);
    for (const bad of ['2026-13', '2026-00', '2026-1', '26-10', '2026-10-01', '', ' 2026-10'])
      expect(isMonthKey(bad)).toBe(false);
  });
});

describe('monthRangeUtc', () => {
  it('a zone ahead of UTC starts the month on the previous UTC day', () => {
    // Auckland is UTC+13 in NZDT (Jan) so local midnight 1 Jan is 11:00 UTC on 31 Dec.
    expect(monthRangeUtc('2026-01', 'Pacific/Auckland')).toEqual({
      fromIso: '2025-12-31T11:00:00.000Z',
      toIso: '2026-01-31T11:00:00.000Z',
    });
  });

  it('Berlin in a normal month is UTC+2 in summer and UTC+1 in winter', () => {
    expect(monthRangeUtc('2026-07', 'Europe/Berlin')).toEqual({
      fromIso: '2026-06-30T22:00:00.000Z',
      toIso: '2026-07-31T22:00:00.000Z',
    });
    expect(monthRangeUtc('2026-12', 'Europe/Berlin')).toEqual({
      fromIso: '2026-11-30T23:00:00.000Z',
      toIso: '2026-12-31T23:00:00.000Z',
    });
  });

  it('a month containing the spring DST change uses each side\'s own offset', () => {
    // Berlin 2026: clocks go forward on 29 March, so March starts at +1 and April at +2.
    expect(monthRangeUtc('2026-03', 'Europe/Berlin')).toEqual({
      fromIso: '2026-02-28T23:00:00.000Z',
      toIso: '2026-03-31T22:00:00.000Z',
    });
    // The month is 31 local days but only 30 days 23 hours long.
    const r = monthRangeUtc('2026-03', 'Europe/Berlin');
    expect((Date.parse(r.toIso) - Date.parse(r.fromIso)) / 3_600_000).toBe(31 * 24 - 1);
  });

  it('rolls December into the next year and handles UTC', () => {
    expect(monthRangeUtc('2026-12', 'UTC')).toEqual({
      fromIso: '2026-12-01T00:00:00.000Z',
      toIso: '2027-01-01T00:00:00.000Z',
    });
  });

  it('a zone whose DST change is at midnight still lands on local midnight', () => {
    // Sao Paulo no longer observes DST; use Asia/Beirut-like midnight changes via America/Havana (DST starts 00:00).
    const r = monthRangeUtc('2026-03', 'America/Havana');
    const local = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Havana', hourCycle: 'h23', dateStyle: 'short', timeStyle: 'short' });
    expect(local.format(new Date(r.fromIso))).toContain('2026-03-01');
  });
});
