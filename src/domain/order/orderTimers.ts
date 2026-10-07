import type { Order } from './Order';

export const ESCALATE_AFTER_MINUTES = 3;

export function isDueForEscalation(o: Pick<Order, 'state' | 'createdAt' | 'escalatedAt'>, now: Date): boolean {
  return (
    o.state === 'PLACED' &&
    !o.escalatedAt &&
    now.getTime() - Date.parse(o.createdAt) >= ESCALATE_AFTER_MINUTES * 60_000
  );
}

export function isDueForAutoReject(o: Pick<Order, 'state' | 'autoRejectAt'>, now: Date): boolean {
  return o.state === 'PLACED' && !!o.autoRejectAt && now.getTime() >= Date.parse(o.autoRejectAt);
}

export function localDate(iso: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    typeof iso === 'string' ? new Date(iso) : iso,
  );
}

/** A ready order nobody collected completes once the restaurant's local day has ended. */
export function isDueForAutoComplete(
  o: Pick<Order, 'state' | 'readyAt' | 'updatedAt'>,
  now: Date,
  timeZone: string,
): boolean {
  return o.state === 'READY' && localDate(o.readyAt ?? o.updatedAt, timeZone) < localDate(now, timeZone);
}
