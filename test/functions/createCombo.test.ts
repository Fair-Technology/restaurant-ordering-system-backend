import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ options: null as any, execute: vi.fn(), readJsonObject: vi.fn() }));

vi.mock('@azure/functions', () => ({
  app: {
    http: (_name: string, o: any) => {
      m.options = o;
    },
  },
}));
vi.mock('../../src/application/combo/createCombo/executeCreateCombo', () => ({
  executeCreateCombo: m.execute,
}));
vi.mock('../../src/functions/_shared/readJsonObject', () => ({
  readJsonObject: m.readJsonObject,
}));

import '../../src/functions/combo/createCombo/index';

const request = { params: { shopId: 'S1' } };

describe('createCombo function', () => {
  beforeEach(() => {
    m.execute.mockReset();
    m.readJsonObject.mockReset();
    m.readJsonObject.mockResolvedValue({ name: 'Combo' });
  });

  it('registers a POST on shops/{shopId}/combos', () => {
    expect(m.options.methods).toEqual(['POST']);
    expect(m.options.route).toBe('shops/{shopId}/combos');
  });

  it('success is a 201 with the data', async () => {
    m.execute.mockResolvedValue({ ok: true, data: { id: 'C1' } });
    const res = await m.options.handler(request);
    expect(res.status).toBe(201);
    expect(res.jsonBody).toEqual({ id: 'C1' });
    expect(m.execute).toHaveBeenCalledWith({ shopId: 'S1', body: { name: 'Combo' } }, request);
  });

  it('create with isAvailable:true and no photo is a 400 with { error, code }', async () => {
    m.execute.mockResolvedValue({ ok: false, code: 'COMBO_IMAGE_REQUIRED_TO_ENABLE', error: 'msg' });
    const res = await m.options.handler(request);
    expect(res.status).toBe(400);
    expect(res.jsonBody).toEqual({ error: 'msg', code: 'COMBO_IMAGE_REQUIRED_TO_ENABLE' });
  });

  it('other refusals still go through mapResultToHttp', async () => {
    m.execute.mockResolvedValue({ ok: false, code: 'NOT_FOUND', error: 'nope' });
    const res = await m.options.handler(request);
    expect(res.status).toBe(404);
  });
});
