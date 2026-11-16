import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCorrection, buildInvoice, invoiceFileName } from '../../../src/domain/invoice/invoice';
import { OWNER_ONLY_ERROR } from '../../../src/application/legal/acceptDpa/executeAcceptDpa';
import { ACCEPTED_CARD_ORDER, CARD_SHOP } from '../../fixtures/orders';

const m = vi.hoisted(() => ({
  authorizeShopAction: vi.fn(),
  findShopById: vi.fn(),
  findInvoiceDocumentsIssuedBetween: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('../../../src/application/_shared/shopAccess', () => ({
  authorizeShopAction: m.authorizeShopAction,
  toAuditActor: (a: any) => ({ actorType: a.actorType, actorId: a.actorId }),
}));
vi.mock('../../../src/application/_shared/auditHelpers', () => ({ logAudit: m.logAudit }));
vi.mock('../../../src/infrastructure/cosmos/shop/CosmosShopRepository', () => ({ findShopById: m.findShopById }));
vi.mock('../../../src/infrastructure/cosmos/invoice/CosmosInvoiceRepository', () => ({
  findInvoiceDocumentsIssuedBetween: m.findInvoiceDocumentsIssuedBetween,
}));

import { executeExportInvoiceArchive } from '../../../src/application/order/invoices/exportInvoiceArchive';

const order = { ...ACCEPTED_CARD_ORDER, state: 'COMPLETED' as const };
const invoice = buildInvoice({ order, shop: CARD_SHOP, number: 'R-2026-00001', now: new Date('2026-10-05T10:05:00Z') });
const correction = buildCorrection({
  original: invoice,
  refunds: [{ amountCents: 300 }],
  index: 0,
  refundId: 'r1',
  number: 'R-2026-00002',
  now: new Date('2026-10-05T12:00:00Z'),
});
const http = {} as any;

/** Names of the stored entries, read from the central directory. */
function entryNames(zip: Buffer): string[] {
  const eocd = zip.length - 22;
  const count = zip.readUInt16LE(eocd + 10);
  let pos = zip.readUInt32LE(eocd + 16);
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    const nameLen = zip.readUInt16LE(pos + 28);
    const extraLen = zip.readUInt16LE(pos + 30);
    const commentLen = zip.readUInt16LE(pos + 32);
    names.push(zip.subarray(pos + 46, pos + 46 + nameLen).toString('utf8'));
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

function entryData(zip: Buffer, index: number): Buffer {
  const eocd = zip.length - 22;
  let pos = zip.readUInt32LE(eocd + 16);
  for (let i = 0; i < index; i++) {
    pos += 46 + zip.readUInt16LE(pos + 28) + zip.readUInt16LE(pos + 30) + zip.readUInt16LE(pos + 32);
  }
  const size = zip.readUInt32LE(pos + 24);
  const local = zip.readUInt32LE(pos + 42);
  const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
  return zip.subarray(start, start + size);
}

beforeEach(() => {
  vi.resetAllMocks();
  m.findShopById.mockResolvedValue(CARD_SHOP);
  m.authorizeShopAction.mockResolvedValue({ ok: true, actor: { actorType: 'owner', actorId: 'u1' }, permissions: [] });
  m.findInvoiceDocumentsIssuedBetween.mockResolvedValue([correction, invoice]);
});

describe('executeExportInvoiceArchive', () => {
  it('the owner gets a ZIP with the invoice and the correction as PDFs', async () => {
    const res = await executeExportInvoiceArchive({ shopId: CARD_SHOP.id, month: '2026-10' }, http);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.fileName).toBe('invoices-2026-10.zip');
    expect(res.data.contentType).toBe('application/zip');
    const zip = Buffer.from(res.data.contentBase64, 'base64');
    expect(entryNames(zip)).toEqual([invoiceFileName(invoice), invoiceFileName(correction)]);
    expect(entryData(zip, 0).toString('latin1').startsWith('%PDF-')).toBe(true);
    expect(entryData(zip, 1).toString('latin1').startsWith('%PDF-')).toBe(true);
    expect(m.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ shopId: CARD_SHOP.id, action: 'shop.invoice_archive', entityType: 'shop' }),
    );
    expect(m.authorizeShopAction).toHaveBeenCalledWith(http, CARD_SHOP, null);
  });

  it('asks the repository for the shop-local month', async () => {
    await executeExportInvoiceArchive({ shopId: CARD_SHOP.id, month: '2026-10' }, http);
    const [, from, to] = m.findInvoiceDocumentsIssuedBetween.mock.calls[0];
    // Berlin leaves DST on 25 Oct, so October is an hour longer than 31 days.
    expect(Date.parse(to) - Date.parse(from)).toBe(31 * 24 * 3_600_000 + 3_600_000);
  });

  it('refuses a staff manager', async () => {
    m.authorizeShopAction.mockResolvedValue({ ok: true, actor: { actorType: 'staff', actorId: 's1' }, permissions: [] });
    const res = await executeExportInvoiceArchive({ shopId: CARD_SHOP.id, month: '2026-10' }, http);
    expect(res).toEqual({ ok: false, code: 'FORBIDDEN', error: OWNER_ONLY_ERROR });
    expect(m.findInvoiceDocumentsIssuedBetween).not.toHaveBeenCalled();
    expect(m.logAudit).not.toHaveBeenCalled();
  });

  it('rejects an invalid month', async () => {
    for (const month of ['2026-13', '2026-1', 'October', '']) {
      const res = await executeExportInvoiceArchive({ shopId: CARD_SHOP.id, month }, http);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe('INVALID_INPUT');
        expect(res.error).toContain('YYYY-MM');
      }
    }
  });

  it('a month with no documents is NOT_FOUND', async () => {
    m.findInvoiceDocumentsIssuedBetween.mockResolvedValue([]);
    const res = await executeExportInvoiceArchive({ shopId: CARD_SHOP.id, month: '2026-09' }, http);
    expect(res).toEqual({
      ok: false,
      code: 'NOT_FOUND',
      error: 'No invoices or correction invoices were issued in that month',
    });
  });

  it('leaves out documents issued outside the month', async () => {
    m.findInvoiceDocumentsIssuedBetween.mockResolvedValue([invoice, { ...correction, issuedAt: '2026-11-02T09:00:00.000Z' }]);
    const res = await executeExportInvoiceArchive({ shopId: CARD_SHOP.id, month: '2026-10' }, http);
    expect(res.ok).toBe(true);
    if (res.ok) expect(entryNames(Buffer.from(res.data.contentBase64, 'base64'))).toEqual([invoiceFileName(invoice)]);
  });

  it('an unknown shop is NOT_FOUND', async () => {
    m.findShopById.mockResolvedValue(null);
    const res = await executeExportInvoiceArchive({ shopId: 'nope', month: '2026-10' }, http);
    expect(res).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });
});
