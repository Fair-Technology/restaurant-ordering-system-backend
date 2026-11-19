import { describe, it, expect } from 'vitest';
import { CLOSURES_MAX, validateClosures } from '../../../src/domain/shop/closures';

const NOW = new Date('2030-01-01T00:00:00Z');
const ok = { start: '2030-02-01T10:00:00Z', end: '2030-02-01T12:00:00Z' };
const err = (input: unknown) => {
  const r = validateClosures(input, NOW);
  return r.ok ? null : r.error;
};

describe('validateClosures', () => {
  it('accepts a list, keeping ids and original strings, trimming reason, dropping extra keys', () => {
    const r = validateClosures([{ ...ok, id: 'keep', reason: '  Holiday ', extra: 'x' }], NOW);
    expect(r).toEqual({ ok: true, value: [{ id: 'keep', ...ok, reason: 'Holiday' }] });
  });

  it('accepts an empty list', () => {
    expect(validateClosures([], NOW)).toEqual({ ok: true, value: [] });
  });

  it('generates ids when missing or empty', () => {
    const r = validateClosures([ok, { ...ok, id: '' }], NOW);
    expect(r.ok && r.value.every((c) => typeof c.id === 'string' && c.id.length > 0)).toBe(true);
    expect(r.ok && r.value[0].id).not.toBe(r.ok && r.value[1].id);
  });

  it('stores a blank reason as undefined', () => {
    const r = validateClosures([{ ...ok, reason: '   ' }], NOW);
    expect(r.ok && r.value[0].reason).toBeUndefined();
  });

  it('keeps a closure that is running now', () => {
    expect(validateClosures([{ start: '2029-12-31T00:00:00Z', end: '2030-01-02T00:00:00Z' }], NOW).ok).toBe(true);
  });

  it('rejects each broken rule', () => {
    expect(err('x')).toBe('closures must be an array');
    expect(err(Array(CLOSURES_MAX + 1).fill(ok))).toBe('closures must not have more than 50 entries');
    expect(err([ok, null])).toBe('closures[1] must be an object');
    expect(err([[]])).toBe('closures[0] must be an object');
    expect(err([{ ...ok, start: '2030-02-01' }])).toBe('closures[0].start must be an ISO-8601 datetime');
    expect(err([{ ...ok, end: 'soon' }])).toBe('closures[0].end must be an ISO-8601 datetime');
    expect(err([{ ...ok, end: ok.start }])).toBe('closures[0].end must be after its start');
    expect(err([{ start: '2029-01-01T00:00:00Z', end: '2029-01-02T00:00:00Z' }])).toBe('closures[0] is in the past');
    expect(err([{ ...ok, reason: 5 }])).toBe('closures[0].reason must be a string');
    expect(err([{ ...ok, reason: 'a'.repeat(201) }])).toBe('closures[0].reason must be at most 200 characters');
    expect(err([{ ...ok, id: 5 }])).toBe('closures[0].id must be a non-empty string');
    expect(err([{ ...ok, id: '  ' }])).toBe('closures[0].id must be a non-empty string');
  });
});
