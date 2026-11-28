import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ query: vi.fn(), create: vi.fn(), read: vi.fn(), replace: vi.fn() }));
vi.mock('../../src/infrastructure/cosmos/cosmosClient', () => ({
  contentReportContainer: {
    items: { query: h.query, create: h.create },
    item: () => ({ read: h.read, replace: h.replace }),
  },
}));

import {
  createContentReport,
  findContentReportById,
  replaceContentReport,
  findContentReports,
} from '../../src/infrastructure/cosmos/contentReport/CosmosContentReportRepository';

const META = { _rid: 'r', _self: 's', _etag: 'e', _attachments: 'a/', _ts: 1 };
const noMeta = (o: object) => { for (const k of Object.keys(META)) expect(o).not.toHaveProperty(k); };

beforeEach(() => vi.resetAllMocks());

describe('CosmosContentReportRepository strips Cosmos metadata', () => {
  it('createContentReport', async () => {
    h.create.mockResolvedValue({ resource: { id: 'r1', ...META } });
    const r = await createContentReport({ id: 'r1' } as any);
    expect(r.id).toBe('r1');
    noMeta(r);
  });

  it('findContentReportById (and null on 404)', async () => {
    h.read.mockResolvedValueOnce({ resource: { id: 'r1', ...META } });
    const r = await findContentReportById('r1');
    expect(r?.id).toBe('r1');
    noMeta(r!);
    h.read.mockRejectedValueOnce({ code: 404 });
    expect(await findContentReportById('nope')).toBeNull();
  });

  it('replaceContentReport', async () => {
    h.replace.mockResolvedValue({ resource: { id: 'r1', ...META } });
    const r = await replaceContentReport({ id: 'r1' } as any);
    expect(r.id).toBe('r1');
    noMeta(r);
  });

  it('findContentReports', async () => {
    h.query
      .mockReturnValueOnce({ fetchAll: async () => ({ resources: [2] }) })
      .mockReturnValueOnce({ fetchAll: async () => ({ resources: [{ id: 'a', ...META }, { id: 'b', ...META }] }) });
    const { reports, total } = await findContentReports({}, 1, 20);
    expect(total).toBe(2);
    expect(reports.map((x) => x.id)).toEqual(['a', 'b']);
    reports.forEach(noMeta);
  });
});
