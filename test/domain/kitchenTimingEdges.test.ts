import { describe, expect, it } from 'vitest';
import { isBusyActive, serviceDateOf } from '../../src/domain/order/kitchenTiming';
import { isOpenForAsapOrder } from '../../src/domain/order/openingHours';

const none = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };

describe('busy mode service day in other time zones and on clock-change nights', () => {
  it('rolls over at 04:00 in the restaurant zone, not in UTC', () => {
    const NY = 'America/New_York'; // EDT, UTC-4 on 2026-10-05
    expect(serviceDateOf(new Date('2026-10-06T07:59:00Z'), NY)).toBe('2026-10-05'); // 03:59 Tue
    expect(serviceDateOf(new Date('2026-10-06T08:00:00Z'), NY)).toBe('2026-10-06'); // 04:00 Tue
  });

  it('on the night the clocks go back, busy mode ends at 03:00 local (documented in the plan)', () => {
    const busy = { extraMinutes: 20, serviceDate: '2026-10-24', startedAt: '2026-10-24T19:00:00.000Z' };
    expect(isBusyActive(busy, 'Europe/Berlin', new Date('2026-10-25T01:59:00Z'))).toBe(true);
    expect(isBusyActive(busy, 'Europe/Berlin', new Date('2026-10-25T02:00:00Z'))).toBe(false);
  });
});

describe('24-hour continuation only applies when the next day really continues from 00:00', () => {
  const TZ = 'Europe/Berlin';
  const at = '2026-10-05T21:50:00Z'; // 23:50 Mon
  it('continues into a next-day window that opens at 00:00', () => {
    const hours = { ...none, mon: [{ open: '18:00', close: '00:00' }], tue: [{ open: '00:00', close: '03:00' }] };
    expect(isOpenForAsapOrder(hours, [], TZ, new Date(at), 20)).toBe(true);
  });
  it('keeps the last-orders gap when the next day opens later', () => {
    const hours = { ...none, mon: [{ open: '18:00', close: '00:00' }], tue: [{ open: '01:00', close: '03:00' }] };
    expect(isOpenForAsapOrder(hours, [], TZ, new Date(at), 20)).toBe(false);
  });
  it('a closure still wins over the continuation', () => {
    const hours = { ...none, mon: [{ open: '00:00', close: '00:00' }], tue: [{ open: '00:00', close: '00:00' }] };
    const closures = [{ start: '2026-10-05T21:00:00Z', end: '2026-10-05T23:00:00Z' }] as any;
    expect(isOpenForAsapOrder(hours, closures, TZ, new Date(at), 20)).toBe(false);
  });
});
