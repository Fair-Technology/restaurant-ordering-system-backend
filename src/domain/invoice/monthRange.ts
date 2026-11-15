const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isMonthKey(value: string): boolean {
  return MONTH_KEY.test(value);
}

/** Offset (ms) of `timeZone` from UTC at the instant `at`: local wall-clock read as if UTC, minus `at`. */
function zoneOffsetMs(at: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(at));
  const n = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'));
  return asUtc - Math.floor(at / 1000) * 1000;
}

/** The UTC instant at which the wall clock in `timeZone` reads midnight on the given local date. */
function localMidnightUtc(year: number, monthIndex: number, timeZone: string): number {
  const wall = Date.UTC(year, monthIndex, 1);
  // The offset must be read at the target instant, which depends on the offset: guess with the offset at the
  // wall time read as UTC, then correct once with the offset at the guess — the second pass settles DST edges.
  const first = wall - zoneOffsetMs(wall, timeZone);
  return wall - zoneOffsetMs(first, timeZone);
}

/** [from, to) as UTC instants: the first moment of the local month `YYYY-MM` and of the following one. */
export function monthRangeUtc(month: string, timeZone: string): { fromIso: string; toIso: string } {
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1;
  return {
    fromIso: new Date(localMidnightUtc(year, monthIndex, timeZone)).toISOString(),
    toIso: new Date(localMidnightUtc(year, monthIndex + 1, timeZone)).toISOString(),
  };
}
