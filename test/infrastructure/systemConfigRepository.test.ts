import { beforeEach, describe, expect, it, vi } from 'vitest';

const { read, upsert } = vi.hoisted(() => ({ read: vi.fn(), upsert: vi.fn(async () => ({})) }));
vi.mock('../../src/infrastructure/cosmos/cosmosClient', () => ({
  systemConfigContainer: { item: () => ({ read }), items: { upsert } },
}));

import { getSystemConfig, upsertSystemConfig } from '../../src/infrastructure/cosmos/system/CosmosSystemConfigRepository';

describe('system config repository: emailEnabled', () => {
  beforeEach(() => vi.clearAllMocks());

  it('defaults to false when there is no document (empty read)', async () => {
    read.mockResolvedValue({ resource: undefined });
    expect(await getSystemConfig()).toMatchObject({ maxShopsDefault: 3, emailEnabled: false });
  });
  it('defaults to false on a 404', async () => {
    read.mockRejectedValue({ code: 404 });
    expect((await getSystemConfig()).emailEnabled).toBe(false);
  });
  it('reads false for an existing document that predates the field', async () => {
    read.mockResolvedValue({ resource: { id: 'global', maxShopsDefault: 7, updatedAt: 'x' } });
    expect(await getSystemConfig()).toMatchObject({ maxShopsDefault: 7, emailEnabled: false });
  });
  it('keeps a stored true', async () => {
    read.mockResolvedValue({ resource: { id: 'global', maxShopsDefault: 7, emailEnabled: true, updatedAt: 'x' } });
    expect((await getSystemConfig()).emailEnabled).toBe(true);
  });
  it('a patch with only one field preserves the other', async () => {
    read.mockResolvedValue({ resource: { id: 'global', maxShopsDefault: 7, emailEnabled: true, updatedAt: 'x' } });
    expect(await upsertSystemConfig({ maxShopsDefault: 2 })).toMatchObject({ maxShopsDefault: 2, emailEnabled: true });
  });
});

describe('system config repository: scheduleHorizonDays', () => {
  beforeEach(() => vi.clearAllMocks());

  it('defaults to 4 without a document and on a 404', async () => {
    read.mockResolvedValue({ resource: undefined });
    expect((await getSystemConfig()).scheduleHorizonDays).toBe(4);
    read.mockRejectedValue({ code: 404 });
    expect((await getSystemConfig()).scheduleHorizonDays).toBe(4);
  });
  it.each([[undefined], [0], [7], [1.5], ['4'], [null]])('reads %s from an existing document as 4', async (v) => {
    read.mockResolvedValue({ resource: { id: 'global', maxShopsDefault: 7, scheduleHorizonDays: v, updatedAt: 'x' } });
    expect((await getSystemConfig()).scheduleHorizonDays).toBe(4);
  });
  it.each([1, 6])('keeps a stored %s', async (v) => {
    read.mockResolvedValue({ resource: { id: 'global', maxShopsDefault: 7, scheduleHorizonDays: v, updatedAt: 'x' } });
    expect((await getSystemConfig()).scheduleHorizonDays).toBe(v);
  });
  it('a patch of another field preserves it, and vice versa', async () => {
    read.mockResolvedValue({ resource: { id: 'global', maxShopsDefault: 7, emailEnabled: true, scheduleHorizonDays: 2, updatedAt: 'x' } });
    expect(await upsertSystemConfig({ maxShopsDefault: 2 })).toMatchObject({ maxShopsDefault: 2, emailEnabled: true, scheduleHorizonDays: 2 });
    expect(await upsertSystemConfig({ scheduleHorizonDays: 5 })).toMatchObject({ maxShopsDefault: 7, emailEnabled: true, scheduleHorizonDays: 5 });
  });
});
