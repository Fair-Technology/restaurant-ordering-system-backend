// Stripe objects arrive as untyped JSON; these read the fields that moved between API versions.

function toIso(v: unknown): string | null {
  return typeof v === 'number' ? new Date(v * 1000).toISOString() : null;
}

/** The billing period. Current API versions keep it on the subscription's item; older ones on the subscription. */
export function subscriptionPeriod(sub: unknown): { start: string | null; end: string | null } {
  const s: any = sub;
  const item = s?.items?.data?.[0];
  return {
    start: toIso(item?.current_period_start ?? s?.current_period_start),
    end: toIso(item?.current_period_end ?? s?.current_period_end),
  };
}

export function subscriptionPriceId(sub: unknown): string | null {
  return (sub as any)?.items?.data?.[0]?.price?.id ?? null;
}

/** The invoice's subscription id: under `parent.subscription_details` in current API versions, top level in older ones. */
export function invoiceSubscriptionId(invoice: unknown): string | null {
  const v = (invoice as any)?.parent?.subscription_details?.subscription ?? (invoice as any)?.subscription;
  return typeof v === 'string' ? v : typeof v?.id === 'string' ? v.id : null;
}

export function isStripeCardError(err: unknown): boolean {
  return (err as any)?.type === 'StripeCardError';
}
