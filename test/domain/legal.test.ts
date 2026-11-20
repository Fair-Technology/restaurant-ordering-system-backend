import { describe, expect, it } from 'vitest';
import {
  buildImpressumLines,
  isImpressumComplete,
  missingImpressumFields,
  validateImpressumInput,
} from '../../src/domain/legal/impressum';
import { isInvoiceLegalExtrasEmpty, nextLegalText, validateInvoiceLegalExtrasInput } from '../../src/domain/legal/legalTexts';
import { isLegalPackComplete, legalCriteria } from '../../src/domain/legal/legalReadiness';
import {
  DEFAULT_PLATFORM_LEGAL_IDENTITY,
  isPlatformIdentityComplete,
  validatePlatformIdentityInput,
} from '../../src/domain/legal/PlatformLegalIdentity';
import { anonymiseOrder } from '../../src/domain/legal/erasure';
import { ADDRESS, DELIVERY_ADDRESS } from '../fixtures/orders';
import { ACCEPTED_DPA, COMPLETE_GMBH, COMPLETE_IDENTITY, COMPLETE_INVOICE_EXTRAS, COMPLETE_LEGAL } from '../fixtures/legal';

const L1 = COMPLETE_LEGAL.terms!;

describe('impressum', () => {
  it('complete GmbH impressum is complete', () => {
    expect(isImpressumComplete(COMPLETE_GMBH)).toBe(true);
  });

  it('GmbH without register number is incomplete', () => {
    expect(missingImpressumFields({ ...COMPLETE_GMBH, registerNumber: '' })).toEqual(['registerNumber']);
  });

  it('sole trader needs no representative or register', () => {
    const i = { ...COMPLETE_GMBH, legalForm: 'sole_trader' as const, representatives: '', registerCourt: '', registerNumber: '' };
    expect(isImpressumComplete(i)).toBe(true);
  });

  it('malformed email makes it incomplete', () => {
    expect(missingImpressumFields({ ...COMPLETE_GMBH, email: 'info@mapasta' })).toEqual(['email']);
  });

  it('a missing impressum lists the seven base fields', () => {
    expect(missingImpressumFields(null)).toHaveLength(7);
  });

  it('normalises a spaced German VAT id', () => {
    const r = validateImpressumInput({ ...COMPLETE_GMBH, vatId: 'de 123 456 789' }, 'DE');
    expect(typeof r === 'string' ? r : r.vatId).toBe('DE123456789');
  });

  it('rejects a malformed German VAT id', () => {
    expect(validateImpressumInput({ ...COMPLETE_GMBH, vatId: 'DE12345' }, 'DE')).toBe(
      'impressum.vatId must look like DE followed by 9 digits',
    );
  });

  it('does not check the VAT id format outside Germany', () => {
    expect(typeof validateImpressumInput({ ...COMPLETE_GMBH, vatId: 'AU123' }, 'AU')).toBe('object');
  });

  it('rejects an unknown legal form', () => {
    expect(validateImpressumInput({ ...COMPLETE_GMBH, legalForm: 'llc' }, 'DE')).toBe(
      'impressum.legalForm must be one of sole_trader, ek, gbr, ohg, kg, gmbh, ug, other',
    );
  });

  it('impressum lines in German', () => {
    expect(buildImpressumLines(COMPLETE_GMBH, 'de')).toEqual([
      { label: 'Anbieter', value: 'Ma Pasta GmbH' },
      { label: 'Anschrift', value: 'Gartenstraße 31, 60596 Frankfurt am Main, Deutschland' },
      { label: 'Vertreten durch', value: 'Giulia Rossi' },
      { label: 'Telefon', value: '069 1234567' },
      { label: 'E-Mail', value: 'info@mapasta.example' },
      { label: 'Registergericht', value: 'Amtsgericht Frankfurt am Main' },
      { label: 'Registernummer', value: 'HRB 123456' },
      { label: 'Umsatzsteuer-Identifikationsnummer', value: 'DE123456789' },
    ]);
  });
});

describe('legal texts', () => {
  it('same text keeps the revision', () => {
    expect(nextLegalText(L1, '  ' + L1.text + ' ', 'n', 'u')).toEqual({ next: L1, archived: null });
  });

  it('changed text bumps the revision and archives the old one', () => {
    expect(nextLegalText(L1, 'X'.repeat(60), '2026-10-02T00:00:00Z', 'u2')).toEqual({
      next: { text: 'X'.repeat(60), revision: 2, updatedAt: '2026-10-02T00:00:00Z', updatedBy: 'u2' },
      archived: L1,
    });
  });

  it('empty text clears and archives', () => {
    expect(nextLegalText(L1, '', 'n', 'u')).toEqual({ next: null, archived: L1 });
  });
});

describe('platform identity', () => {
  it('default platform identity is incomplete', () => {
    expect(isPlatformIdentityComplete(DEFAULT_PLATFORM_LEGAL_IDENTITY)).toBe(false);
    expect(isPlatformIdentityComplete(COMPLETE_IDENTITY)).toBe(true);
  });

  it('treats an all-blank EU representative as none', () => {
    const r = validatePlatformIdentityInput({
      platformName: 'X',
      salesSiteUrl: null,
      operator: COMPLETE_IDENTITY.operator,
      euRepresentative: { name: '', address: '', email: '' },
    });
    expect(typeof r === 'object' && r.euRepresentative).toBeNull();
  });
});

describe('legal readiness', () => {
  it('legal criteria all unmet for an empty shop', () => {
    expect(legalCriteria({ id: 's' } as any, DEFAULT_PLATFORM_LEGAL_IDENTITY).map((c) => [c.key, c.met])).toEqual([
      ['dpa_accepted', false],
      ['impressum', false],
      ['terms', false],
      ['withdrawal', false],
      ['privacy_notice', false],
    ]);
  });

  it('legal criteria all met', () => {
    const shop = { legal: COMPLETE_LEGAL, dpaAcceptance: ACCEPTED_DPA } as any;
    expect(legalCriteria(shop, COMPLETE_IDENTITY).every((c) => c.met)).toBe(true);
  });

  it('dpa criterion needs the current version', () => {
    const shop = { legal: COMPLETE_LEGAL, dpaAcceptance: { ...ACCEPTED_DPA, version: '2025-01-01' } } as any;
    expect(legalCriteria(shop, COMPLETE_IDENTITY).find((c) => c.key === 'dpa_accepted')!.met).toBe(false);
    expect(isLegalPackComplete(shop)).toBe(true);
  });

  it('checkout pack needs a DPA acceptance, impressum, terms and withdrawal each', () => {
    const base = { legal: COMPLETE_LEGAL, dpaAcceptance: ACCEPTED_DPA } as any;
    expect(isLegalPackComplete(base)).toBe(true);
    expect(isLegalPackComplete({ ...base, dpaAcceptance: null })).toBe(false);
    expect(isLegalPackComplete({ ...base, dpaAcceptance: undefined })).toBe(false);
    expect(isLegalPackComplete({ ...base, legal: { ...COMPLETE_LEGAL, impressum: null } })).toBe(false);
    expect(isLegalPackComplete({ ...base, legal: { ...COMPLETE_LEGAL, terms: null } })).toBe(false);
    expect(isLegalPackComplete({ ...base, legal: { ...COMPLETE_LEGAL, withdrawal: null } })).toBe(false);
    expect(isLegalPackComplete({ id: 's' } as any)).toBe(false);
  });
});

describe('erasure', () => {
  it('anonymises personal fields and removes the notes key', () => {
    const o = {
      id: 'o1',
      customerName: 'Anna',
      customerEmail: 'a@x.example',
      customerPhone: '1',
      customerNotes: 'no nuts',
      updatedAt: 'old',
    } as any;
    const r = anonymiseOrder(o, '2026-10-05T00:00:00.000Z');
    expect(r).toEqual({
      id: 'o1',
      customerName: 'Deleted customer',
      customerEmail: '',
      customerPhone: '',
      anonymisedAt: '2026-10-05T00:00:00.000Z',
      updatedAt: '2026-10-05T00:00:00.000Z',
    });
    expect('customerNotes' in r).toBe(false);
  });

  it('removes the order link token', () => {
    const r = anonymiseOrder(
      { id: 'o1', customerName: 'A', customerEmail: 'a@x', customerPhone: '1', customerAccessToken: 't', updatedAt: 'old' } as any,
      '2026-10-05T00:00:00.000Z',
    );
    expect('customerAccessToken' in r).toBe(false);
  });

  it('removes the billing address', () => {
    const r = anonymiseOrder(
      { id: 'o1', customerName: 'A', customerEmail: 'a@x', customerPhone: '1', customerAddress: ADDRESS, updatedAt: 'old' } as any,
      '2026-10-05T00:00:00.000Z',
    );
    expect('customerAddress' in r).toBe(false);
  });

  it('removes the delivery address', () => {
    const r = anonymiseOrder(
      { id: 'o1', customerName: 'A', customerEmail: 'a@x', customerPhone: '1', deliveryAddress: DELIVERY_ADDRESS, updatedAt: 'old' } as any,
      '2026-10-05T00:00:00.000Z',
    );
    expect('deliveryAddress' in r).toBe(false);
  });
});

describe('invoice legal extras', () => {
  const BLANK = { managingDirector: '', court: '', registerNumber: '', iban: '', bic: '' };

  it('all fields blank is valid', () => {
    expect(validateInvoiceLegalExtrasInput(BLANK)).toEqual(BLANK);
  });

  it('a fully filled valid input round-trips trimmed', () => {
    const padded = Object.fromEntries(Object.entries(COMPLETE_INVOICE_EXTRAS).map(([k, v]) => [k, `  ${v}  `]));
    expect(validateInvoiceLegalExtrasInput(padded)).toEqual(COMPLETE_INVOICE_EXTRAS);
  });

  it('normalises spaces and case in IBAN and BIC', () => {
    const r = validateInvoiceLegalExtrasInput({ ...BLANK, iban: 'de89 3704 0044 0532 0130 00', bic: 'cobadeffxxx' });
    expect(r).toEqual({ ...BLANK, iban: 'DE89370400440532013000', bic: 'COBADEFFXXX' });
  });

  it('rejects an invalid IBAN', () => {
    expect(validateInvoiceLegalExtrasInput({ ...BLANK, iban: 'nope' })).toBe(
      'invoiceLegalExtras.iban is not a valid IBAN',
    );
  });

  it('rejects an invalid BIC', () => {
    expect(validateInvoiceLegalExtrasInput({ ...BLANK, bic: '123' })).toBe(
      'invoiceLegalExtras.bic is not a valid BIC',
    );
  });

  it('rejects an overlong field', () => {
    expect(validateInvoiceLegalExtrasInput({ ...BLANK, court: 'x'.repeat(301) })).toBe(
      'invoiceLegalExtras.court must be a string of at most 300 characters',
    );
  });

  it('isInvoiceLegalExtrasEmpty is true only when every field is blank', () => {
    expect(isInvoiceLegalExtrasEmpty(BLANK)).toBe(true);
    expect(isInvoiceLegalExtrasEmpty({ ...BLANK, bic: 'COBADEFFXXX' })).toBe(false);
  });

  it('has no effect on Impressum or legal-pack completeness', () => {
    const before = { ...COMPLETE_GMBH, registerNumber: '' };
    const shopA: any = { id: 's', dpaAcceptance: ACCEPTED_DPA, legal: COMPLETE_LEGAL };
    const shopB: any = { ...shopA, legal: { ...COMPLETE_LEGAL, invoiceLegalExtras: COMPLETE_INVOICE_EXTRAS } };
    expect(isImpressumComplete(shopB.legal.impressum)).toBe(isImpressumComplete(shopA.legal.impressum));
    expect(missingImpressumFields(shopB.legal.impressum)).toEqual(missingImpressumFields(shopA.legal.impressum));
    expect(missingImpressumFields(before)).toEqual(['registerNumber']);
    expect(legalCriteria(shopB, COMPLETE_IDENTITY)).toEqual(legalCriteria(shopA, COMPLETE_IDENTITY));
    expect(isLegalPackComplete(shopB)).toBe(isLegalPackComplete(shopA));
  });
});
