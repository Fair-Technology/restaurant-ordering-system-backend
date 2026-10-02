import { describe, expect, it } from 'vitest';
import {
  buildImpressumLines,
  isImpressumComplete,
  missingImpressumFields,
  validateImpressumInput,
} from '../../src/domain/legal/impressum';
import { nextLegalText } from '../../src/domain/legal/legalTexts';
import { isLegalPackComplete, legalCriteria } from '../../src/domain/legal/legalReadiness';
import {
  DEFAULT_PLATFORM_LEGAL_IDENTITY,
  isPlatformIdentityComplete,
  validatePlatformIdentityInput,
} from '../../src/domain/legal/PlatformLegalIdentity';
import { anonymiseOrder } from '../../src/domain/legal/erasure';
import { ACCEPTED_DPA, COMPLETE_GMBH, COMPLETE_IDENTITY, COMPLETE_LEGAL } from '../fixtures/legal';

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
});
