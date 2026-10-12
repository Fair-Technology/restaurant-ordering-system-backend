import { TranslationMap } from '../menu/menuLanguage';

export interface Category {
  // Identity & ownership
  id: string; // UUID (Cosmos item id)
  shopId: string; // owning shop UUID

  // Core info
  name: string; // category name, original language
  nameTranslations?: TranslationMap;
  sortOrder: number; // for ordering categories
  icon?: string; // optional Lucide icon name

  // Tax
  taxClassId: string | null; // references a ReferenceListsDoc tax class; null = country has none configured

  // Visibility: a switched-off category, or one outside its times, is hidden on the storefront
  isAvailable?: boolean; // absent = on (categories made before the switch existed)
  schedule?: CategorySchedule | null; // absent/null = shown at all times

  // Lifecycle
  isDeleted: boolean; // soft delete flag

  // Audit
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
}

/** Weekly times a category is shown, in the shop's time zone. */
export interface CategorySchedule {
  daysOfWeek: number[]; // 0=Sun 1=Mon … 6=Sat; at least one
  startTime: string; // "HH:mm" 24-hour, shown from
  endTime: string; // "HH:mm" 24-hour, hidden from; after startTime (no overnight windows)
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Checks a schedule sent by the admin; returns it cleaned, null to clear it, or the problem. */
export function parseCategorySchedule(
  input: unknown,
): CategorySchedule | null | string {
  if (input === null) return null;
  const s = input as Record<string, unknown> | undefined;
  if (!s || typeof s !== 'object' || Array.isArray(s))
    return 'schedule must be an object or null';
  const days = s.daysOfWeek;
  if (
    !Array.isArray(days) ||
    days.length === 0 ||
    days.some(
      (d) => typeof d !== 'number' || !Number.isInteger(d) || d < 0 || d > 6,
    )
  ) {
    return 'schedule.daysOfWeek must list at least one day from 0 (Sunday) to 6 (Saturday)';
  }
  if (typeof s.startTime !== 'string' || !TIME.test(s.startTime))
    return 'schedule.startTime must be HH:mm';
  if (typeof s.endTime !== 'string' || !TIME.test(s.endTime))
    return 'schedule.endTime must be HH:mm';
  if (s.endTime <= s.startTime)
    return 'schedule.endTime must be after schedule.startTime';
  return {
    daysOfWeek: [...new Set(days as number[])].sort(),
    startTime: s.startTime,
    endTime: s.endTime,
  };
}

/** True while the category is on the storefront: not deleted, switched on, and inside its times. */
export function isCategoryLive(
  c: Pick<Category, 'isDeleted' | 'isAvailable' | 'schedule'>,
  timezone: string,
  now: Date,
): boolean {
  if (c.isDeleted || c.isAvailable === false) return false;
  if (!c.schedule) return true;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const part = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? '';
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
    part('weekday'),
  );
  const time = `${part('hour')}:${part('minute')}`;
  return (
    c.schedule.daysOfWeek.includes(day) &&
    time >= c.schedule.startTime &&
    time < c.schedule.endTime
  );
}
