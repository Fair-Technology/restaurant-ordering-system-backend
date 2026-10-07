import { describe, it, expect } from 'vitest';
import type { OrderActor, OrderHistoryEntry } from '../../src/domain/order/Order';
import { rejectionStats, type OrderForRejectionStats } from '../../src/domain/usage/rejectionStats';

const now = new Date('2026-10-07T12:00:00Z');

function o(
  createdAt: string,
  opts: { accepted?: boolean; to?: 'REJECTED' | 'CANCELLED'; actor?: OrderActor; reason?: string } = {},
): OrderForRejectionStats {
  const history: OrderHistoryEntry[] = [{ from: null, to: 'PLACED', at: createdAt, actor: { type: 'customer' } }];
  if (opts.to) history.push({ from: 'PLACED', to: opts.to, at: createdAt, actor: opts.actor ?? { type: 'system' }, reason: opts.reason });
  return { createdAt, acceptedAt: opts.accepted ? createdAt : undefined, history };
}
const staffDecline = (at: string) => o(at, { to: 'REJECTED', actor: { type: 'staff', id: 's1' }, reason: 'too_busy' });

describe('rejectionStats', () => {
  it("counts only the restaurant's own declines", () => {
    const orders = [
      ...[1, 2, 3, 4, 5, 1, 2, 3].map((d) => o(`2026-10-0${d}T10:00:00Z`, { accepted: true })),
      staffDecline('2026-10-02T10:00:00Z'),
      staffDecline('2026-10-03T10:00:00Z'),
      o('2026-10-04T10:00:00Z', { to: 'REJECTED', actor: { type: 'system' }, reason: 'no_response' }),
      o('2026-10-04T11:00:00Z', { to: 'REJECTED', actor: { type: 'system' }, reason: 'payment_failed' }),
      o('2026-10-04T12:00:00Z', { to: 'CANCELLED', actor: { type: 'customer' } }),
    ];
    expect(rejectionStats(orders, now, 0)).toMatchObject({ accepted: 8, rejectedByRestaurant: 2, rate: 0.2, flags: ['high_rate'] });
  });

  it('ignores orders older than 30 days', () => {
    expect(rejectionStats([staffDecline('2026-09-01T00:00:00Z')], now, 0).rejectedByRestaurant).toBe(0);
  });

  it('no decided orders means no rate', () => {
    expect(rejectionStats([], now, 0)).toMatchObject({ rate: null, flags: [] });
  });

  const spiky = [
    ...Array.from({ length: 30 }, () => o('2026-10-01T10:00:00Z', { accepted: true })),
    ...[1, 2, 3].map(() => staffDecline('2026-10-05T10:00:00Z')),
  ];

  it('flags a decline spike near the limit', () => {
    expect(rejectionStats(spiky, now, 90).flags).toEqual(['spike_near_limit']);
  });

  it('no spike flag below 80 %', () => {
    expect(rejectionStats(spiky, now, 0).flags).toEqual([]);
  });
});
