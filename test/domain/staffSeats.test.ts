import { describe, it, expect } from 'vitest';
import { seatHolderIds } from '../../src/domain/staff/staffSeats';

const acc = (id: string, createdAt: string, isActive = true) => ({ id, isActive, isDeleted: false, createdAt });
const ACCOUNTS = [
  acc('a', '2026-09-01T00:00:00Z'),
  acc('b', '2026-09-02T00:00:00Z'),
  acc('c', '2026-09-03T00:00:00Z'),
  acc('d', '2026-09-02T00:00:00Z', false),
];

describe('seatHolderIds', () => {
  it('the oldest logins keep their seats', () => {
    expect(seatHolderIds(ACCOUNTS, 2)).toEqual(new Set(['a', 'b']));
  });

  it('no limit seats everyone active', () => {
    expect(seatHolderIds(ACCOUNTS, null)).toEqual(new Set(['a', 'b', 'c']));
  });
});
