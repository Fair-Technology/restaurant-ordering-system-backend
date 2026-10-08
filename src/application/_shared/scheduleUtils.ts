import { ProductSchedule } from '../../domain/product/Product';

export function isProductScheduleActive(schedule: ProductSchedule, timezone: string, now: Date = new Date()): boolean {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  });

  // Current date as "YYYY-MM-DD" in shop timezone
  const currentDate = formatter.format(now); // en-CA gives YYYY-MM-DD

  // Current time as "HH:mm" in shop timezone
  const currentTime = timeFormatter.format(now).replace(/\u200e/g, ''); // strip LTR marks

  // Current weekday 0=Sun … 6=Sat
  const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weekdayShort = weekdayFormatter.format(now);
  const currentWeekday = weekdayNames.indexOf(weekdayShort);

  // 1. startDate check
  if (currentDate < schedule.startDate) return false;

  // 2. endDate check
  if (schedule.endDate) {
    if (currentDate > schedule.endDate) return false;
  }

  // 3. daysOfWeek check
  if (schedule.daysOfWeek) {
    if (schedule.daysOfWeek.length === 0) return false;
    if (!schedule.daysOfWeek.includes(currentWeekday)) return false;
  }

  // 4. time window check (absent = available all day)
  const startTime = schedule.startTime || '00:00';
  const endTime = schedule.endTime || '23:59';
  if (currentTime < startTime || currentTime > endTime) return false;

  return true;
}
