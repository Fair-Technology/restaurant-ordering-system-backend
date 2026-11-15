import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ options: null as any }));

vi.mock('@azure/functions', () => ({
  app: {
    http: (_name: string, o: any) => {
      m.options = o;
    },
  },
}));
vi.mock('../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({ findShopById: vi.fn() }));
vi.mock('../../src/infrastructure/cosmos/contentReport/CosmosContentReportRepository', () => ({
  createContentReport: vi.fn(async (r: any) => r),
}));

import { findShopById } from '../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { createContentReport } from '../../src/infrastructure/cosmos/contentReport/CosmosContentReportRepository';
import { CONTENT_URL_ERROR } from '../../src/application/contentReport/submitContentReport/executeSubmitContentReport';
import '../../src/functions/contentReport/submitContentReport/index';

const SHOP = { id: 'shop-1', slug: 'pizzeria', name: 'Pizzeria', isDeleted: false };

/** The handler reads the raw body text off the request. */
const request = (body: unknown) => ({
  params: { shopId: 'shop-1' },
  text: async () => JSON.stringify(body),
});

describe('submitContentReport function (public, anonymous)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (findShopById as any).mockResolvedValue(SHOP);
  });

  it('registers an anonymous POST on shops/{shopId}/content-reports', () => {
    expect(m.options.methods).toEqual(['POST']);
    expect(m.options.authLevel).toBe('anonymous');
    expect(m.options.route).toBe('shops/{shopId}/content-reports');
  });

  it('accepts an https contentUrl and returns the receipt', async () => {
    const res = await m.options.handler(request({ category: 'other', reason: 'x', contentUrl: 'https://x.example/p/1' }));
    expect(res.status).toBe(200);
    expect(res.jsonBody.status).toBe('received');
    expect(createContentReport).toHaveBeenCalledWith(
      expect.objectContaining({ contentUrl: 'https://x.example/p/1' }),
    );
  });

  it.each([
    ['javascript:', 'javascript:alert(document.domain)'],
    ['data:', 'data:text/html,<script>document.title="pwned"</script>'],
    ['protocol-relative', '//evil.example/x'],
    ['relative path', '/products/mapasta'],
  ])('refuses a %s contentUrl with 400 and stores nothing', async (_label, contentUrl) => {
    const res = await m.options.handler(request({ category: 'other', reason: 'x', contentUrl }));
    expect(res.status).toBe(400);
    expect(res.jsonBody).toEqual({ error: CONTENT_URL_ERROR });
    expect(createContentReport).not.toHaveBeenCalled();
  });

  it('still accepts a report with no contentUrl', async () => {
    const res = await m.options.handler(request({ category: 'other', reason: 'x' }));
    expect(res.status).toBe(200);
    expect('contentUrl' in ((createContentReport as any).mock.calls[0][0] as object)).toBe(false);
  });
});
