import type { StaffAccount } from './StaffAccount';

export const SEAT_SUSPENDED_ERROR = 'SEAT_SUSPENDED';

/** The ids of the logins that may sign in: the oldest `limit` active ones. limit null = everyone active. */
export function seatHolderIds(
  accounts: Pick<StaffAccount, 'id' | 'isActive' | 'isDeleted' | 'createdAt'>[],
  limit: number | null,
): Set<string> {
  const active = accounts
    .filter((a) => a.isActive && !a.isDeleted)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  return new Set((limit === null ? active : active.slice(0, Math.max(0, limit))).map((a) => a.id));
}
