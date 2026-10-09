import type { Order } from './Order';

export const ESCALATE_AFTER_MINUTES = 3;

export function isDueForEscalation(
  o: Pick<Order, 'state' | 'createdAt' | 'escalatedAt' | 'scheduledFor' | 'queuedAt'>,
  now: Date,
): boolean {
  if (o.state !== 'PLACED' || o.escalatedAt) return false;
  if (o.scheduledFor && !o.queuedAt) return false; // still upcoming
  return now.getTime() - Date.parse(o.queuedAt ?? o.createdAt) >= ESCALATE_AFTER_MINUTES * 60_000;
}

export function isDueForAutoReject(o: Pick<Order, 'state' | 'autoRejectAt'>, now: Date): boolean {
  return o.state === 'PLACED' && !!o.autoRejectAt && now.getTime() >= Date.parse(o.autoRejectAt);
}

export function localDate(iso: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    typeof iso === 'string' ? new Date(iso) : iso,
  );
}

/** A ready or delivered order nobody marked as handed over completes once the restaurant's local day has ended. */
export function isDueForAutoComplete(
  o: Pick<Order, 'state' | 'readyAt' | 'updatedAt'>,
  now: Date,
  timeZone: string,
): boolean {
  return (o.state === 'READY' || o.state === 'OUT_FOR_DELIVERY') && localDate(o.readyAt ?? o.updatedAt, timeZone) < localDate(now, timeZone);
}
