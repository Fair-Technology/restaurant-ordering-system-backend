import type { Shop } from './Shop';

export const CLOSURES_MAX = 50;
export const CLOSURE_REASON_MAX_LENGTH = 200;

// Same strictness as the slot parser in order/scheduling.ts: a date-only value is not a closure time.
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

function isIsoDatetime(v: unknown): v is string {
  return typeof v === 'string' && ISO_DATETIME.test(v) && Number.isFinite(Date.parse(v));
}

/**
 * Validates and normalises a replacement list of dated closures. A closure that has already
 * finished is refused; one that is running now stays saveable so the list can be re-saved.
 */
export function validateClosures(
  input: unknown,
  now: Date,
): { ok: true; value: Shop['closures'] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: 'closures must be an array' };
  if (input.length > CLOSURES_MAX) {
    return { ok: false, error: `closures must not have more than ${CLOSURES_MAX} entries` };
  }
  const value: Shop['closures'] = [];
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (typeof c !== 'object' || c === null || Array.isArray(c)) {
      return { ok: false, error: `closures[${i}] must be an object` };
    }
    const e = c as Record<string, unknown>;
    if (!isIsoDatetime(e.start)) return { ok: false, error: `closures[${i}].start must be an ISO-8601 datetime` };
    if (!isIsoDatetime(e.end)) return { ok: false, error: `closures[${i}].end must be an ISO-8601 datetime` };
    if (!(Date.parse(e.end) > Date.parse(e.start))) {
      return { ok: false, error: `closures[${i}].end must be after its start` };
    }
    if (!(Date.parse(e.end) > now.getTime())) return { ok: false, error: `closures[${i}] is in the past` };

    let reason: string | undefined;
    if (e.reason !== undefined) {
      if (typeof e.reason !== 'string') return { ok: false, error: `closures[${i}].reason must be a string` };
      reason = e.reason.trim() || undefined;
      if (reason && reason.length > CLOSURE_REASON_MAX_LENGTH) {
        return { ok: false, error: `closures[${i}].reason must be at most ${CLOSURE_REASON_MAX_LENGTH} characters` };
      }
    }

    let id: string;
    if (e.id === undefined || e.id === '') {
      id = crypto.randomUUID();
    } else if (typeof e.id !== 'string' || e.id.trim() === '') {
      return { ok: false, error: `closures[${i}].id must be a non-empty string` };
    } else {
      id = e.id;
    }
    value.push({ id, start: e.start, end: e.end, ...(reason !== undefined && { reason }) });
  }
  return { ok: true, value };
}
