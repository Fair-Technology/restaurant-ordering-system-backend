import { describe, it, expect } from 'vitest';
import { periodKeyFor } from '../../src/domain/usage/usagePeriod';

describe('periodKeyFor', () => {
  it('rolls to next month in Berlin before UTC', () => {
    expect(periodKeyFor(new Date('2026-09-30T22:30:00Z'), 'Europe/Berlin')).toBe('2026-10');
    expect(periodKeyFor(new Date('2026-09-30T22:30:00Z'), 'UTC')).toBe('2026-09');
  });

  it('year rollover', () => {
    expect(periodKeyFor(new Date('2026-12-31T23:30:00Z'), 'Europe/Berlin')).toBe('2027-01');
  });
});
