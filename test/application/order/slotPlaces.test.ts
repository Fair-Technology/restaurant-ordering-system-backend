import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSlotPlaces,
  findSlotPlacesWithEtag,
  replaceSlotPlacesIfMatch,
} from '../../../src/infrastructure/cosmos/usage/CosmosSlotPlacesRepository';
import {
  fixSlotPlace,
  holdSlotPlace,
  loadBookableSlots,
  loadSlotsTaken,
  releaseSlotPlace,
} from '../../../src/application/order/_shared/slotPlaces';
import { NOW_CLOSED, SCHEDULED_SHOP } from '../../fixtures/orders';
import { capped, dayDoc, installSlotStore } from '../../fixtures/slotPlaces';

vi.mock('../../../src/infrastructure/cosmos/usage/CosmosSlotPlacesRepository', () => ({
  findSlotPlacesWithEtag: vi.fn(async () => null),
  createSlotPlaces: vi.fn(async () => 'ok'),
  replaceSlotPlacesIfMatch: vi.fn(async () => 'ok'),
}));

const now = new Date('2026-10-05T10:00:00Z');
const S = '2026-10-06T16:00:00.000Z';

describe('slot places', () => {
  beforeEach(() => vi.clearAllMocks());

  it('two diners racing for the last place: one gets it, the other is told it is full', async () => {
    const store = installSlotStore();
    const res = await Promise.all([
      holdSlotPlace({ shop: capped(1), orderId: 'A', slot: new Date(S), now }),
      holdSlotPlace({ shop: capped(1), orderId: 'B', slot: new Date(S), now }),
    ]);
    expect([...res].sort()).toEqual(['full', 'ok']);
    expect(store.doc('2026-10-06')!.places).toHaveLength(1);
  });

  it('a booking that loses a write re-reads and counts the winner', async () => {
    const store = installSlotStore([dayDoc('2026-10-06', [])]);
    const res = await Promise.all([
      holdSlotPlace({ shop: capped(1), orderId: 'A', slot: new Date(S), now }),
      holdSlotPlace({ shop: capped(1), orderId: 'B', slot: new Date(S), now }),
    ]);
    expect([...res].sort()).toEqual(['full', 'ok']);
    expect(replaceSlotPlacesIfMatch).toHaveBeenCalledTimes(2);
    expect(store.doc('2026-10-06')!.places).toHaveLength(1);
  });

  it('a hold is kept even without a limit, so a later limit counts it', async () => {
    const store = installSlotStore();
    expect(await holdSlotPlace({ shop: SCHEDULED_SHOP, orderId: 'A', slot: new Date(S), now })).toBe('ok');
    expect(store.doc('2026-10-06')!.places).toEqual([{ orderId: 'A', slot: S, heldUntil: '2026-10-05T10:20:00.000Z' }]);
    expect(await holdSlotPlace({ shop: capped(1), orderId: 'B', slot: new Date(S), now })).toBe('full');
  });

  it('fixing a place keeps it whatever the limit', async () => {
    const store = installSlotStore([
      dayDoc('2026-10-06', [
        { orderId: 'X', slot: S, heldUntil: null },
        { orderId: 'A', slot: S, heldUntil: '2026-10-05T10:20:00.000Z' },
      ]),
    ]);
    await fixSlotPlace({ shop: capped(1), orderId: 'A', slot: S, now });
    expect(store.doc('2026-10-06')!.places).toEqual([
      { orderId: 'X', slot: S, heldUntil: null },
      { orderId: 'A', slot: S, heldUntil: null },
    ]);
  });

  it("releasing frees a booked place and an accepted order's place", async () => {
    const store = installSlotStore([
      dayDoc('2026-10-06', [{ orderId: 'A', slot: S, heldUntil: null }]),
      dayDoc('2026-10-05', [{ orderId: 'N', slot: '2026-10-05T10:15:00.000Z', heldUntil: null }]),
    ]);
    await releaseSlotPlace({ shop: SCHEDULED_SHOP, order: { id: 'A', scheduledFor: S }, now });
    await releaseSlotPlace({ shop: SCHEDULED_SHOP, order: { id: 'N', readyAt: '2026-10-05T10:25:00.000Z' }, now });
    expect(store.doc('2026-10-06')!.places).toEqual([]);
    expect(store.doc('2026-10-05')!.places).toEqual([]);
    const calls = vi.mocked(findSlotPlacesWithEtag).mock.calls.length;
    await releaseSlotPlace({ shop: SCHEDULED_SHOP, order: { id: 'Z' }, now });
    expect(vi.mocked(findSlotPlacesWithEtag).mock.calls.length).toBe(calls);
  });

  it('releasing never throws', async () => {
    installSlotStore();
    vi.mocked(findSlotPlacesWithEtag).mockRejectedValueOnce(new Error('down'));
    await expect(
      releaseSlotPlace({ shop: SCHEDULED_SHOP, order: { id: 'A', scheduledFor: S }, now }),
    ).resolves.toBeUndefined();
    vi.mocked(findSlotPlacesWithEtag).mockRejectedValueOnce(new Error('down'));
    await expect(fixSlotPlace({ shop: SCHEDULED_SHOP, orderId: 'A', slot: S, now })).resolves.toBeUndefined();
  });

  it('counts live places per quarter hour over the days asked', async () => {
    installSlotStore([
      dayDoc('2026-10-06', [
        { orderId: 'a', slot: S, heldUntil: null },
        { orderId: 'b', slot: S, heldUntil: '2026-10-05T10:05:00.000Z' },
        { orderId: 'c', slot: S, heldUntil: '2026-10-05T09:00:00.000Z' },
      ]),
    ]);
    expect(await loadSlotsTaken(SCHEDULED_SHOP, [S, '2026-10-06T16:15:00.000Z'], now)).toEqual({ [S]: 2 });
    expect(findSlotPlacesWithEtag).toHaveBeenCalledTimes(1);
    expect(findSlotPlacesWithEtag).toHaveBeenCalledWith('shop-1', '2026-10-06');
  });

  it('bookable times leave out full quarter hours', async () => {
    installSlotStore([
      dayDoc('2026-10-06', [
        { orderId: 'a', slot: S, heldUntil: null },
        { orderId: 'b', slot: S, heldUntil: null },
      ]),
    ]);
    const full = await loadBookableSlots(capped(2), 'collection', NOW_CLOSED, new Date(S));
    expect(full.slots).toHaveLength(171);
    expect(full.slots).not.toContain(S);
    expect(full.slots[0]).toBe('2026-10-06T09:30:00.000Z');
    expect(full.slotAvailable).toBe(false);
    const free = await loadBookableSlots(capped(2), 'collection', NOW_CLOSED, new Date('2026-10-06T16:15:00.000Z'));
    expect(free.slotAvailable).toBe(true);
  });

  it('without a limit nothing is read for the list', async () => {
    const res = await loadBookableSlots(SCHEDULED_SHOP, 'collection', NOW_CLOSED, null);
    expect(res.slots).toHaveLength(172);
    expect(res.slotAvailable).toBeNull();
    expect(findSlotPlacesWithEtag).not.toHaveBeenCalled();
  });

  it('five lost writes in a row count as full', async () => {
    installSlotStore([dayDoc('2026-10-06', [])]);
    vi.mocked(replaceSlotPlacesIfMatch).mockImplementation(async () => 'conflict');
    expect(await holdSlotPlace({ shop: capped(3), orderId: 'A', slot: new Date(S), now })).toBe('full');
    expect(replaceSlotPlacesIfMatch).toHaveBeenCalledTimes(5);
    expect(createSlotPlaces).not.toHaveBeenCalled();
  });
});
