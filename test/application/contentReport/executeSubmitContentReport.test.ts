import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({ findShopById: vi.fn() }));
vi.mock('../../../src/infrastructure/cosmos/contentReport/CosmosContentReportRepository', () => ({
  createContentReport: vi.fn(async (r: any) => r),
}));

import { findShopById } from '../../../src/infrastructure/cosmos/shop/CosmosShopRepository';
import { createContentReport } from '../../../src/infrastructure/cosmos/contentReport/CosmosContentReportRepository';
import { executeSubmitContentReport } from '../../../src/application/contentReport/submitContentReport/executeSubmitContentReport';
import { CONTENT_REPORT_REASON_MAX_LENGTH, CONTENT_REPORT_URL_MAX_LENGTH } from '../../../src/domain/contentReport/ContentReport';

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
  ])('rejects %s with INVALID_INPUT', async (_label, shopId, body) => {
    const r = await executeSubmitContentReport(shopId as string, body as any);
    expect(r).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(findShopById).not.toHaveBeenCalled();
    expect(createContentReport).not.toHaveBeenCalled();
  });

  it('returns INTERNAL_ERROR when the repository fails', async () => {
    (createContentReport as any).mockRejectedValueOnce(new Error('cosmos down'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await executeSubmitContentReport('shop-1', { category: 'other', reason: 'x' })).toMatchObject({
      ok: false, code: 'INTERNAL_ERROR',
    });
    spy.mockRestore();
  });
});
