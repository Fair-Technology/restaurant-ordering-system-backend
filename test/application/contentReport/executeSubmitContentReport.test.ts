import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({ findShopById: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/contentReport/CosmosContentReportRepository', () => ({
  createContentReport: vi.fn(async (r: any) => r),
  countRecentContentReportsByIpHash: vi.fn(async () => 0),
}));

import { findShopById } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { createContentReport, countRecentContentReportsByIpHash } from '../../../src/infrastructure/cosmos/contentReport/CosmosContentReportRepository';
import { executeSubmitContentReport, CONTENT_URL_ERROR } from '../../../src/application/contentReport/submitContentReport/executeSubmitContentReport';
import { CONTENT_REPORT_RATE_LIMIT_MAX, CONTENT_REPORT_REASON_MAX_LENGTH, CONTENT_REPORT_URL_MAX_LENGTH } from '../../../src/domain/contentReport/ContentReport';

const SHOP = { id: 'shop-1', slug: 'pizzeria', name: 'Pizzeria', isDeleted: false };

describe('executeSubmitContentReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (findShopById as any).mockResolvedValue(SHOP);
  });

  it('records a report for the shop and returns the receipt', async () => {
    const r = await executeSubmitContentReport(' shop-1 ', {
      category: 'illegal_goods',
      reason: '  selling something illegal  ',
      contentUrl: ' https://x.example/p/1 ',
      reporterName: ' Ann ',
      reporterEmail: ' ann@example.com ',
    });
    expect(findShopById).toHaveBeenCalledWith('shop-1');
    expect(createContentReport).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: 'shop-1',
        category: 'illegal_goods',
        reason: 'selling something illegal',
        contentUrl: 'https://x.example/p/1',
        reporterName: 'Ann',
        reporterEmail: 'ann@example.com',
        shopSlug: 'pizzeria',
        shopName: 'Pizzeria',
        status: 'received',
      }),
    );
    const saved = (createContentReport as any).mock.calls[0][0];
    expect(saved.id).toMatch(/^[0-9a-f-]{36}$/);
    expect('decision' in saved).toBe(false);
    expect(r).toEqual({ ok: true, data: { reportId: saved.id, status: 'received', receivedAt: saved.receivedAt } });
  });

  it('accepts an anonymous report and stores no optional keys', async () => {
    const r = await executeSubmitContentReport('shop-1', {
      category: 'other',
      reason: 'x',
      reporterEmail: '   ',
      reporterName: '',
    });
    expect(r.ok).toBe(true);
    const saved = (createContentReport as any).mock.calls[0][0];
    expect('reporterEmail' in saved).toBe(false);
    expect('reporterName' in saved).toBe(false);
    expect('contentUrl' in saved).toBe(false);
  });

  it('returns NOT_FOUND for an unknown or deleted shop', async () => {
    (findShopById as any).mockResolvedValueOnce(null);
    expect(await executeSubmitContentReport('nope', { category: 'other', reason: 'x' })).toMatchObject({
      ok: false, code: 'NOT_FOUND',
    });
    (findShopById as any).mockResolvedValueOnce({ ...SHOP, isDeleted: true });
    expect(await executeSubmitContentReport('shop-1', { category: 'other', reason: 'x' })).toMatchObject({
      ok: false, code: 'NOT_FOUND',
    });
    expect(createContentReport).not.toHaveBeenCalled();
  });

  it.each([
    ['empty shopId', '', { category: 'other', reason: 'x' }],
    ['bad category', 'shop-1', { category: 'weapons', reason: 'x' }],
    ['empty reason', 'shop-1', { category: 'other', reason: '   ' }],
    ['missing reason', 'shop-1', { category: 'other' }],
    ['oversized reason', 'shop-1', { category: 'other', reason: 'a'.repeat(CONTENT_REPORT_REASON_MAX_LENGTH + 1) }],
    ['bad email', 'shop-1', { category: 'other', reason: 'x', reporterEmail: 'not-an-email' }],
    ['non-string name', 'shop-1', { category: 'other', reason: 'x', reporterName: 5 }],
    ['oversized url', 'shop-1', { category: 'other', reason: 'x', contentUrl: 'h'.repeat(CONTENT_REPORT_URL_MAX_LENGTH + 1) }],
    // This route is public and the console renders contentUrl as a link: no non-web scheme,
    // no relative path. These are the exact payloads the console was verified against (D2).
    ['javascript: url', 'shop-1', { category: 'other', reason: 'x', contentUrl: 'javascript:alert(document.domain)' }],
    ['data: url', 'shop-1', { category: 'other', reason: 'x', contentUrl: 'data:text/html,<script>document.title="pwned"</script>' }],
    ['vbscript: url', 'shop-1', { category: 'other', reason: 'x', contentUrl: 'vbscript:msgbox(1)' }],
    ['file: url', 'shop-1', { category: 'other', reason: 'x', contentUrl: 'file:///etc/passwd' }],
    ['relative path', 'shop-1', { category: 'other', reason: 'x', contentUrl: '/products/mapasta' }],
    ['protocol-relative path', 'shop-1', { category: 'other', reason: 'x', contentUrl: '//evil.example/x' }],
    ['scheme with no host', 'shop-1', { category: 'other', reason: 'x', contentUrl: 'https://' }],
  ])('rejects %s with INVALID_INPUT', async (_label, shopId, body) => {
    const r = await executeSubmitContentReport(shopId as string, body as any);
    expect(r).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(findShopById).not.toHaveBeenCalled();
    expect(createContentReport).not.toHaveBeenCalled();
  });

  it('states the http(s) requirement for a rejected contentUrl', async () => {
    const r = await executeSubmitContentReport('shop-1', {
      category: 'other',
      reason: 'x',
      contentUrl: 'javascript:alert(1)',
    });
    expect(r).toEqual({ ok: false, code: 'INVALID_INPUT', error: CONTENT_URL_ERROR });
  });

  it.each([
    ['https', 'https://x.example/p/1'],
    ['http', 'http://x.example/p/1'],
    ['upper-case scheme', 'HTTPS://X.EXAMPLE/p/1'],
    ['url with query and fragment', 'https://x.example/p/1?ref=a&x=b#top'],
  ])('accepts a %s contentUrl', async (_label, contentUrl) => {
    const r = await executeSubmitContentReport('shop-1', { category: 'other', reason: 'x', contentUrl });
    expect(r.ok).toBe(true);
    expect(createContentReport).toHaveBeenCalledWith(expect.objectContaining({ contentUrl }));
  });

  it.each([[''], ['   '], [undefined], [null]])('still treats %p contentUrl as absent', async (contentUrl) => {
    const r = await executeSubmitContentReport('shop-1', { category: 'other', reason: 'x', contentUrl } as any);
    expect(r.ok).toBe(true);
    const saved = (createContentReport as any).mock.calls[0][0];
    expect('contentUrl' in saved).toBe(false);
  });

  it('returns INTERNAL_ERROR when the repository fails', async () => {
    (createContentReport as any).mockRejectedValueOnce(new Error('cosmos down'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await executeSubmitContentReport('shop-1', { category: 'other', reason: 'x' })).toMatchObject({
      ok: false, code: 'INTERNAL_ERROR',
    });
    spy.mockRestore();
  });

  describe('rate limiting', () => {
    const body = { category: 'other', reason: 'x' } as const;
    const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => {});

    it('rejects with RATE_LIMITED at the limit and saves nothing', async () => {
      (countRecentContentReportsByIpHash as any).mockResolvedValueOnce(CONTENT_REPORT_RATE_LIMIT_MAX);
      const r = await executeSubmitContentReport('shop-1', body, '1.2.3.4');
      expect(r).toMatchObject({ ok: false, code: 'RATE_LIMITED' });
      expect(createContentReport).not.toHaveBeenCalled();
      expect(findShopById).not.toHaveBeenCalled();
    });

    it('succeeds under the limit', async () => {
      (countRecentContentReportsByIpHash as any).mockResolvedValueOnce(CONTENT_REPORT_RATE_LIMIT_MAX - 1);
      expect((await executeSubmitContentReport('shop-1', body, '1.2.3.4')).ok).toBe(true);
    });

    it('does not check or limit when there is no client IP', async () => {
      (countRecentContentReportsByIpHash as any).mockResolvedValue(CONTENT_REPORT_RATE_LIMIT_MAX + 10);
      const r = await executeSubmitContentReport('shop-1', body);
      expect(r.ok).toBe(true);
      expect(countRecentContentReportsByIpHash).not.toHaveBeenCalled();
      const saved = (createContentReport as any).mock.calls[0][0];
      expect('ipHash' in saved).toBe(false);
      (countRecentContentReportsByIpHash as any).mockResolvedValue(0);
    });

    it('stores a stable sha256 hash, never the raw IP', async () => {
      await executeSubmitContentReport('shop-1', body, '1.2.3.4');
      await executeSubmitContentReport('shop-1', body, '1.2.3.4');
      const [a, b] = (createContentReport as any).mock.calls.map((c: any[]) => c[0]);
      expect(a.ipHash).toMatch(/^[0-9a-f]{64}$/);
      expect(a.ipHash).toBe(b.ipHash);
      expect(JSON.stringify(a)).not.toContain('1.2.3.4');
    });

    it('returns INTERNAL_ERROR when the count query fails', async () => {
      (countRecentContentReportsByIpHash as any).mockRejectedValueOnce(new Error('cosmos down'));
      const spy = quiet();
      expect(await executeSubmitContentReport('shop-1', body, '1.2.3.4')).toMatchObject({
        ok: false, code: 'INTERNAL_ERROR',
      });
      spy.mockRestore();
    });
  });
});
