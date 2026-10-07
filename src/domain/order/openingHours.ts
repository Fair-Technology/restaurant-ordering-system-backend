import type { Shop } from '../shop/Shop';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
}

function localParts(now: Date, timeZone: string): { dayIndex: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  const hour = Number(get('hour')) % 24; // some engines report midnight as '24'
  return { dayIndex: WEEKDAY_SHORT.indexOf(get('weekday')), minutes: hour * 60 + Number(get('minute')) };
}

/**
 * Whether an "as soon as possible" order may be placed now: inside an opening window with at least
 * `leadMinutes` left before it closes, and outside every closure. A window whose close is not after
 * its open runs past midnight into the next day; "00:00"–"00:00" is open all day.
 */
export function isOpenForAsapOrder(
  hours: Shop['openingHours'] | undefined,
  closures: Shop['closures'] | undefined,
  timeZone: string,
  now: Date,
  leadMinutes: number,
): boolean {
  const t = now.getTime();
  for (const c of closures ?? []) {
    if (Date.parse(c.start) <= t && t < Date.parse(c.end)) return false;
  }
  if (!hours) return false;
  const { dayIndex, minutes } = localParts(now, timeZone);
  if (dayIndex < 0) return false;

  const next = DAY_KEYS[(dayIndex + 1) % 7];
  for (const w of hours[DAY_KEYS[dayIndex]] ?? []) {
    const open = toMin(w.open);
    const close = toMin(w.close) + (toMin(w.close) <= open ? 1440 : 0);
    // A window ending at 00:00 that the next day continues from 00:00 has no last-orders gap at midnight.
    const continues = toMin(w.close) === 0 && (hours[next] ?? []).some((n) => toMin(n.open) === 0);
    if (open <= minutes && minutes <= close - (continues ? 0 : leadMinutes)) return true;
  }
  const previous = DAY_KEYS[(dayIndex + 6) % 7];
  for (const w of hours[previous] ?? []) {
    if (toMin(w.close) <= toMin(w.open) && minutes <= toMin(w.close) - leadMinutes) return true;
  }
  return false;
}
