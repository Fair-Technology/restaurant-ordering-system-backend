import { describe, expect, it } from 'vitest';
import {
  autoAcceptsAt,
  busyStateOf,
  describeWeeklyHours,
  effectivePrepMinutes,
  isBusyActive,
  lastOrdersLeadMinutes,
  parseWeeklyHours,
  serviceDateOf,
} from '../../src/domain/order/kitchenTiming';

const TZ = 'Europe/Berlin';
const week = (over: Record<string, { open: string; close: string }[]> = {}) => ({
  mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [], ...over,
});
const BUSY = { extraMinutes: 20, serviceDate: '2026-10-05', startedAt: '2026-10-05T10:00:00.000Z' };

describe('kitchen timing', () => {
  it('prep time per mode falls back to the defaults', () => {
    const shop = { timezone: TZ, orderSettings: { prepMinutes: { collection: 15 } }, busyMode: null };
    const now = new Date('2026-10-05T10:00:00Z');
    expect(effectivePrepMinutes(shop, 'collection', now)).toBe(15);
    expect(effectivePrepMinutes(shop, 'dine_in', now)).toBe(20);
    expect(effectivePrepMinutes(shop, 'delivery', now)).toBe(45);
  });

  it('busy mode adds its minutes until 04:00 the next morning', () => {
    const shop = { timezone: TZ, orderSettings: null, busyMode: BUSY };
    expect(effectivePrepMinutes(shop, 'collection', new Date('2026-10-05T21:59:00Z'))).toBe(40);
    expect(effectivePrepMinutes(shop, 'collection', new Date('2026-10-06T01:59:00Z'))).toBe(40);
    expect(effectivePrepMinutes(shop, 'collection', new Date('2026-10-06T02:00:00Z'))).toBe(20);
  });

  it("busy mode tapped after midnight ends before the next day's service", () => {
    expect(serviceDateOf(new Date('2026-10-10T22:30:00Z'), TZ)).toBe('2026-10-10');
    const busy = { extraMinutes: 20, serviceDate: '2026-10-10', startedAt: '2026-10-10T22:30:00.000Z' };
    expect(isBusyActive(busy, TZ, new Date('2026-10-10T23:00:00Z'))).toBe(true);
    expect(isBusyActive(busy, TZ, new Date('2026-10-11T02:00:00Z'))).toBe(false);
    expect(isBusyActive(busy, TZ, new Date('2026-10-11T16:00:00Z'))).toBe(false);
  });

  it('the estimate never goes above 240 minutes', () => {
    const shop = {
      timezone: TZ,
      orderSettings: { prepMinutes: { collection: 120 } },
      busyMode: { ...BUSY, extraMinutes: 130 },
    };
    expect(effectivePrepMinutes(shop, 'collection', new Date('2026-10-05T10:00:00Z'))).toBe(240);
  });

  it("last orders default to the mode's prep time", () => {
    expect(lastOrdersLeadMinutes({ orderSettings: { prepMinutes: { collection: 25 } } }, 'collection')).toBe(25);
    expect(lastOrdersLeadMinutes({ orderSettings: { lastOrdersMinutes: 0 } }, 'collection')).toBe(0);
    expect(lastOrdersLeadMinutes({ orderSettings: { lastOrdersMinutes: 45 } }, 'collection')).toBe(45);
  });

  it('with no automatic hours set, auto-accept is all day', () => {
    expect(autoAcceptsAt({ timezone: TZ, orderSettings: {} }, new Date('2026-10-05T21:00:00Z'))).toBe(true);
  });

  it('auto-accept switched off means never', () => {
    const shop = { timezone: TZ, orderSettings: { autoAccept: false, autoAcceptHours: null } };
    expect(autoAcceptsAt(shop, new Date('2026-10-05T10:00:00Z'))).toBe(false);
  });

  it('automatic inside the hours, by hand outside', () => {
    const shop = {
      timezone: TZ,
      orderSettings: { autoAcceptHours: week({ mon: [{ open: '09:00', close: '18:00' }] }) },
    };
    expect(autoAcceptsAt(shop, new Date('2026-10-05T10:00:00Z'))).toBe(true);
    expect(autoAcceptsAt(shop, new Date('2026-10-05T16:00:00Z'))).toBe(true);
    expect(autoAcceptsAt(shop, new Date('2026-10-05T16:30:00Z'))).toBe(false);
    expect(autoAcceptsAt(shop, new Date('2026-10-05T06:30:00Z'))).toBe(false);
  });

  it('automatic hours that run past midnight carry into the next day', () => {
    const shop = {
      timezone: TZ,
      orderSettings: { autoAcceptHours: week({ sat: [{ open: '18:00', close: '01:00' }] }) },
    };
    expect(autoAcceptsAt(shop, new Date('2026-10-10T22:30:00Z'))).toBe(true);
    expect(autoAcceptsAt(shop, new Date('2026-10-10T23:30:00Z'))).toBe(false);
  });

  it('the clock change does not shift the automatic hours', () => {
    const shop = {
      timezone: TZ,
      orderSettings: { autoAcceptHours: week({ sun: [{ open: '09:00', close: '18:00' }] }) },
    };
    expect(autoAcceptsAt(shop, new Date('2026-10-25T07:30:00Z'))).toBe(false);
    expect(autoAcceptsAt(shop, new Date('2026-10-25T08:30:00Z'))).toBe(true);
  });

  it('reads a weekly list of times', () => {
    expect(parseWeeklyHours({ mon: [{ open: '09:00', close: '18:00' }] })).toEqual(
      week({ mon: [{ open: '09:00', close: '18:00' }] }),
    );
    expect(parseWeeklyHours(null)).toBeNull();
    expect(parseWeeklyHours({ mon: [{ open: '00:00', close: '00:00' }] })).toEqual(
      week({ mon: [{ open: '00:00', close: '00:00' }] }),
    );
    expect(parseWeeklyHours({ mon: [{ open: '9:00', close: '18:00' }] })).toBe('invalid');
    expect(parseWeeklyHours({ mon: [{ open: '09:00', close: '09:00' }] })).toBe('invalid');
    expect(parseWeeklyHours({ funday: [] })).toBe('invalid');
    expect(parseWeeklyHours({ mon: Array(5).fill({ open: '09:00', close: '10:00' }) })).toBe('invalid');
    expect(parseWeeklyHours('x')).toBe('invalid');
  });

  it('describes the hours for the activity log', () => {
    expect(describeWeeklyHours(null)).toBe('always');
    expect(describeWeeklyHours(week())).toBe('never');
    expect(
      describeWeeklyHours(
        week({ mon: [{ open: '09:00', close: '12:00' }, { open: '14:00', close: '18:00' }] }),
      ),
    ).toBe('mon 09:00–12:00, 14:00–18:00');
  });

  it('busy state for the board', () => {
    const now = new Date('2026-10-05T10:00:00Z');
    expect(busyStateOf({ timezone: TZ, orderSettings: { busyExtraMinutes: 25 }, busyMode: null }, now)).toEqual({
      active: false,
      extraMinutes: 25,
    });
    expect(busyStateOf({ timezone: TZ, orderSettings: { busyExtraMinutes: 25 }, busyMode: BUSY }, now)).toEqual({
      active: true,
      extraMinutes: 20,
    });
  });
});
