import { describe, expect, it } from 'vitest';
import { buildPrivacyNotice } from '../../src/domain/legal/privacyNotice';
import { CURRENT_DPA } from '../../src/domain/legal/platformDocuments';
import { COMPLETE_GMBH, COMPLETE_IDENTITY } from '../fixtures/legal';

const base = { lang: 'de' as const, impressum: COMPLETE_GMBH, identity: COMPLETE_IDENTITY, privacyAddition: null };

describe('buildPrivacyNotice', () => {
  it('names the restaurant as controller', () => {
    const n = buildPrivacyNotice(base);
    expect(n.sections[0].heading).toBe('Verantwortlicher');
    expect(n.sections[0].paragraphs.join(' ')).toContain('Ma Pasta GmbH');
  });

  it('names Stripe as independent controller with its privacy link', () => {
    const n = buildPrivacyNotice(base);
    expect(n.sections.some((s) => s.paragraphs.some((p) => p.includes('https://stripe.com/de/privacy')))).toBe(true);
  });

  it('lists the three Microsoft sub-processors', () => {
    const s = buildPrivacyNotice(base).sections[3];
    expect(s.paragraphs).toHaveLength(3);
    expect(s.paragraphs[0].startsWith('Microsoft Ireland Operations Ltd. — Microsoft Azure')).toBe(true);
  });

  it('names the platform operator as processor', () => {
    expect(buildPrivacyNotice(base).sections[2].paragraphs.join(' ')).toContain('Fair Technology Pty Ltd');
  });

  it('mentions the billing address and invoice retention', () => {
    const de = buildPrivacyNotice(base).sections.flatMap((x) => x.paragraphs).join(' ');
    expect(de).toContain('Rechnungsadresse');
    expect(de).toContain('acht Jahre');
    const en = buildPrivacyNotice({ ...base, lang: 'en' }).sections.flatMap((x) => x.paragraphs).join(' ');
    expect(en).toContain('billing address');
    expect(en).toContain('eight years');
  });

  it('is marked draft', () => {
    const n = buildPrivacyNotice(base);
    expect(n.isDraft).toBe(true);
    expect(n.templateVersion).toBe('2026-10-09-draft');
  });

  it("includes the restaurant's own addition last", () => {
    const n = buildPrivacyNotice({ ...base, privacyAddition: 'Eins\n\nZwei' });
    const last = n.sections[n.sections.length - 1];
    expect(last.heading).toBe('Ergänzende Hinweise von Ma Pasta GmbH');
    expect(last.paragraphs).toEqual(['Eins', 'Zwei']);
  });

  it('mentions codes and loyalty vouchers', () => {
    const de = buildPrivacyNotice(base).sections.flatMap((x) => x.paragraphs).join(' ');
    expect(de).toContain('Gutschein');
    expect(de).toContain('ankreuzen');
    const en = buildPrivacyNotice({ ...base, lang: 'en' }).sections.flatMap((x) => x.paragraphs).join(' ');
    expect(en).toContain('voucher');
    expect(en).toContain('tick the box');
    expect(buildPrivacyNotice(base).sections).toHaveLength(8);
  });

  it('has eight sections without an addition', () => {
    expect(buildPrivacyNotice(base).sections).toHaveLength(8);
  });
});

describe('DPA draft', () => {
  it('has 14 sections in both languages, starting with the placeholder', () => {
    expect(CURRENT_DPA.isDraft).toBe(true);
    for (const lang of ['de', 'en'] as const) {
      expect(CURRENT_DPA.sections[lang]).toHaveLength(14);
      expect(CURRENT_DPA.sections[lang][0].paragraphs[0]).toMatch(/^\[(Platzhalter|Placeholder)/);
    }
  });

  it('mentions the delivery address', () => {
    const de = buildPrivacyNotice(base).sections.flatMap((x) => x.paragraphs).join(' ');
    expect(de).toContain('Lieferadresse');
    const en = buildPrivacyNotice({ ...base, lang: 'en' }).sections.flatMap((x) => x.paragraphs).join(' ');
    expect(en).toContain('delivery address');
  });
});
