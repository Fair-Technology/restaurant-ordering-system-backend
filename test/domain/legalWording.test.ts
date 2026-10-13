import { describe, expect, it } from 'vitest';
import { buildPrivacyNotice, PRIVACY_IS_DRAFT, PRIVACY_TEMPLATE_VERSION } from '../../src/domain/legal/privacyNotice';
import { CURRENT_DPA, DPA_VERSIONS } from '../../src/domain/legal/platformDocuments';
import { DINER_PAYMENT_METHOD_TYPES } from '../../src/infrastructure/stripe/stripeClient';
import { COMPLETE_GMBH, COMPLETE_IDENTITY } from '../fixtures/legal';

const base = { lang: 'de' as const, impressum: COMPLETE_GMBH, identity: COMPLETE_IDENTITY, privacyAddition: null };
const notice = (lang: 'de' | 'en') => buildPrivacyNotice({ ...base, lang });
const all = (lang: 'de' | 'en') =>
  notice(lang)
    .sections.flatMap((s) => [s.heading, ...s.paragraphs])
    .join(' ');
const dpaText = (lang: 'de' | 'en') =>
  [CURRENT_DPA.title[lang], ...CURRENT_DPA.sections[lang].flatMap((s) => [s.heading, ...s.paragraphs])].join(' ');

describe('legal wording', () => {
  it('no current legal text mentions PayPal', () => {
    for (const lang of ['de', 'en'] as const) {
      expect(all(lang)).not.toMatch(/paypal/i);
      expect(dpaText(lang)).not.toMatch(/paypal/i);
    }
  });

  it('privacy notice names card, Apple Pay and Google Pay', () => {
    const de = all('de');
    const en = all('en');
    for (const t of ['Karte', 'Apple Pay', 'Google Pay']) expect(de).toContain(t);
    for (const t of ['card', 'Apple Pay', 'Google Pay']) expect(en).toContain(t);
  });

  it('privacy notice no longer promises saved details', () => {
    expect(all('de')).not.toContain('Angaben für die nächste Bestellung');
    expect(all('en')).not.toContain('details for next time');
    expect(all('de')).toContain('nicht für spätere Bestellungen gespeichert');
    expect(all('en')).toContain('not saved for later orders');
  });

  it('privacy notice describes browser storage', () => {
    for (const t of ['localStorage', 'sessionStorage', 'Tischnummer', 'Postleitzahl']) expect(all('de')).toContain(t);
    for (const t of ['localStorage', 'sessionStorage', 'table number', 'postcode']) expect(all('en')).toContain(t);
  });

  it('privacy notice says Stripe.js loads at the payment step', () => {
    expect(all('de')).toContain('Stripe.js');
    expect(all('de')).toContain('im Zahlungsschritt');
    expect(all('en')).toContain('Stripe.js');
    expect(all('en')).toContain('at the payment step');
  });

  it('privacy notice version bumped and still draft', () => {
    expect(PRIVACY_TEMPLATE_VERSION).toBe('2026-10-13-draft');
    expect(notice('de').isDraft).toBe(true);
    expect(PRIVACY_IS_DRAFT).toBe(true);
  });

  it('DE and EN have the same shape', () => {
    const shape = (lang: 'de' | 'en') => notice(lang).sections.map((s) => s.paragraphs.length);
    expect(shape('de')).toEqual([3, 4, 2, 3, 5, 4, 2, 2]);
    expect(shape('de')).toEqual(shape('en'));
    expect(CURRENT_DPA.sections.de.map((s) => s.paragraphs.length)).toEqual(
      CURRENT_DPA.sections.en.map((s) => s.paragraphs.length),
    );
  });

  it('DPA: new version appended, old one kept', () => {
    expect(DPA_VERSIONS.map((d) => d.version)).toEqual(['2026-10-01-draft', '2026-10-13-draft']);
    expect(CURRENT_DPA).toBe(DPA_VERSIONS[1]);
    expect(CURRENT_DPA.isDraft).toBe(true);
    expect(CURRENT_DPA.publishedAt).toBe('2026-10-13');
  });

  it('DPA 2026-10-01 text is unchanged', () => {
    expect(DPA_VERSIONS[0].sections.en[13]).toEqual({
      heading: 'Card payments (Stripe)',
      paragraphs: [
        '[Placeholder – the reviewed clause is inserted after the lawyer review.]',
        'Stripe is an independent controller for card and PayPal payment data. It is not a sub-processor of the platform.',
      ],
    });
    expect(DPA_VERSIONS[0].sections.de[13].paragraphs[1]).toBe(
      'Stripe ist für Karten- und PayPal-Zahlungsdaten ein eigenständiger Verantwortlicher. Stripe ist kein Unterauftragsverarbeiter der Plattform.',
    );
  });

  it('DPA clause 14 names card, Apple Pay and Google Pay', () => {
    expect(CURRENT_DPA.sections.de[13].heading).toBe('Zahlungen (Stripe)');
    expect(CURRENT_DPA.sections.en[13].paragraphs[1]).toContain('card, Apple Pay or Google Pay');
  });

  it('diner payment methods match the legal texts', () => {
    expect(
      DINER_PAYMENT_METHOD_TYPES,
      'Payment methods changed: update privacyNotice.ts section 5 and append a new DPA version',
    ).toEqual(['card']);
  });
});
