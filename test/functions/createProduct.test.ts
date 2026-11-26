import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ options: null as any, execute: vi.fn() }));

vi.mock('@azure/functions', () => ({
  app: {
    http: (_name: string, o: any) => {
      m.options = o;
    },
  },
}));
vi.mock('../../src/application/product/createProduct/executeCreateProduct', () => ({
  executeCreateProduct: m.execute,
}));

import '../../src/functions/product/createProduct/index';

const request = { json: async () => ({ name: 'Dish' }) };

describe('createProduct function', () => {
  beforeEach(() => m.execute.mockReset());

  it('registers a POST on products', () => {
    expect(m.options.methods).toEqual(['POST']);
    expect(m.options.route).toBe('products');
  });

  it('success passes through mapResultToHttp unchanged', async () => {
    m.execute.mockResolvedValue({ ok: true, data: { id: 'P1' } });
    const res = await m.options.handler(request);
    expect(res.status).toBe(200);
    expect(res.jsonBody).toEqual({ id: 'P1' });
  });

  it('create with isAvailable:true and no photo is a 400 with { error, code }', async () => {
    m.execute.mockResolvedValue({ ok: false, code: 'PRODUCT_IMAGE_REQUIRED_TO_ENABLE', error: 'msg' });
    const res = await m.options.handler(request);
    expect(res.status).toBe(400);
    expect(res.jsonBody).toEqual({ error: 'msg', code: 'PRODUCT_IMAGE_REQUIRED_TO_ENABLE' });
  });

  it('other refusals still go through mapResultToHttp', async () => {
    m.execute.mockResolvedValue({ ok: false, code: 'NOT_FOUND', error: 'nope' });
    const res = await m.options.handler(request);
    expect(res.status).toBe(404);
  });
});
