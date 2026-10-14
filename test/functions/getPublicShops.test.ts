import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ options: null as any, execute: vi.fn() }));

vi.mock('@azure/functions', () => ({
  app: {
    http: (_name: string, o: any) => {
      m.options = o;
    },
  },
}));
vi.mock('../../src/application/shop/getPublicShops/executeGetPublicShops', () => ({
  executeGetPublicShops: m.execute,
}));

import '../../src/functions/shop/getPublicShops/index';

describe('getPublicShops function', () => {
  beforeEach(() => m.execute.mockReset());

  it('registers an anonymous GET on shops/public', () => {
    expect(m.options.methods).toEqual(['GET']);
    expect(m.options.authLevel).toBe('anonymous');
    expect(m.options.route).toBe('shops/public');
  });

  it('returns the list with 200', async () => {
    m.execute.mockResolvedValue({ ok: true, data: { shops: [{ id: 'A' }] } });
    const res = await m.options.handler({});
    expect(res.status).toBe(200);
    expect(res.jsonBody).toEqual({ shops: [{ id: 'A' }] });
  });

  it('an internal error is a 500', async () => {
    m.execute.mockResolvedValue({ ok: false, code: 'INTERNAL_ERROR', error: 'Failed to retrieve shops' });
    const res = await m.options.handler({});
    expect(res.status).toBe(500);
  });

  it('an unexpected throw is a 500 with a generic body', async () => {
    m.execute.mockResolvedValue(null) // makes mapResultToHttp throw;
    const res = await m.options.handler({});
    expect(res.status).toBe(500);
    expect(res.jsonBody).toEqual({ error: 'Internal server error' });
  });
});
