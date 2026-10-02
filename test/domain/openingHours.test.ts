import { describe, expect, it } from 'vitest';
import { isOpenForAsapOrder } from '../../src/domain/order/openingHours';

const H = {
  mon: [
    { open: '11:30', close: '14:30' },
    { open: '17:00', close: '22:00' },
  ],
  tue: [],
  wed: [],
  thu: [],
  fri: [],
  sat: [{ open: '18:00', close: '01:00' }],
  sun: [],
};
const TZ = 'Europe/Berlin';
const open = (iso: string, closures: Parameters<typeof isOpenForAsapOrder>[1] = []): boolean =>
  isOpenForAsapOrder(H, closures, TZ, new Date(iso), 20);

describe('isOpenForAsapOrder', () => {
  it('open in a lunch window', () => {
    expect(open('2026-10-05T10:00:00Z')).toBe(true);
  });

  it('last orders stop one prep-time before closing', () => {
    expect(open('2026-10-05T12:10:00Z')).toBe(true);
    expect(open('2026-10-05T12:11:00Z')).toBe(false);
  });

  it('closed between windows', () => {
    expect(open('2026-10-05T13:00:00Z')).toBe(false);
  });

  it('overnight window continues after midnight', () => {
    expect(open('2026-10-10T22:30:00Z')).toBe(true);
    expect(open('2026-10-10T22:45:00Z')).toBe(false);
  });

  it('a closure overrides the pattern', () => {
    expect(open('2026-10-05T10:00:00Z', [{ id: 'x', start: '2026-10-05T00:00:00Z', end: '2026-10-06T00:00:00Z' }])).toBe(
      false,
    );
  });

  it('a day with no windows is closed', () => {
    expect(open('2026-10-06T10:00:00Z')).toBe(false);
  });
});
