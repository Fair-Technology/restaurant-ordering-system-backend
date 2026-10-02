import { LegalLanguage } from './impressum';

export interface LegalSection {
  heading: string;
  paragraphs: string[];
}

export interface PlatformDocument {
  version: string;
  isDraft: boolean;
  publishedAt: string; // 'YYYY-MM-DD'
  title: Record<LegalLanguage, string>;
  sections: Record<LegalLanguage, LegalSection[]>;
}

const PLACEHOLDER: Record<LegalLanguage, string> = {
  de: '[Platzhalter – die geprüfte Klausel wird nach der anwaltlichen Prüfung eingefügt.]',
  en: '[Placeholder – the reviewed clause is inserted after the lawyer review.]',
};

const HEADINGS: Record<LegalLanguage, string[]> = {
  en: [
    'Parties and subject matter',
    'Duration',
    'Nature and purpose of processing',
    'Types of data and data subjects',
    'Instructions',
    'Confidentiality',
    'Security measures',
    'Sub-processors',
    'Assistance',
    'Breach notification',
    'Deletion or return',
    'Audits',
    'International transfers',
    'Card payments (Stripe)',
  ],
  de: [
    'Parteien und Gegenstand',
    'Laufzeit',
    'Art und Zweck der Verarbeitung',
    'Art der Daten und betroffene Personen',
    'Weisungen',
    'Vertraulichkeit',
    'Sicherheitsmaßnahmen',
    'Unterauftragsverarbeiter',
    'Unterstützung',
    'Meldung von Datenschutzverletzungen',
    'Löschung oder Rückgabe',
    'Prüfungen',
    'Internationale Datenübermittlungen',
    'Kartenzahlungen (Stripe)',
  ],
};

// Only the agreed shape (spec §15) for these sections; no other clause wording.
const EXTRA_PARAGRAPHS: Record<LegalLanguage, Record<number, string>> = {
  en: {
    8: "The restaurant gives the platform a general authorisation to use sub-processors, currently the Microsoft services listed below. The platform gives 30 days' notice of any change, the restaurant may object, and if the objection cannot be resolved either side may terminate the agreement.",
    10: 'The platform notifies the restaurant without undue delay after becoming aware of a personal data breach.',
    13: 'The data is hosted in the EU. Where a transfer outside the EU or EEA is unavoidable, the EU Standard Contractual Clauses are incorporated.',
    14: 'Stripe is an independent controller for card and PayPal payment data. It is not a sub-processor of the platform.',
  },
  de: {
    8: 'Das Restaurant erteilt der Plattform eine allgemeine Genehmigung zum Einsatz von Unterauftragsverarbeitern, derzeit die unten aufgeführten Microsoft-Dienste. Die Plattform kündigt jede Änderung 30 Tage vorher an, das Restaurant kann widersprechen, und wenn der Widerspruch nicht gelöst werden kann, kann jede Seite den Vertrag kündigen.',
    10: 'Die Plattform informiert das Restaurant unverzüglich, nachdem ihr eine Verletzung des Schutzes personenbezogener Daten bekannt geworden ist.',
    13: 'Die Daten werden in der EU gehostet. Ist eine Übermittlung außerhalb der EU oder des EWR unvermeidbar, gelten die EU-Standardvertragsklauseln.',
    14: 'Stripe ist für Karten- und PayPal-Zahlungsdaten ein eigenständiger Verantwortlicher. Stripe ist kein Unterauftragsverarbeiter der Plattform.',
  },
};

function buildSections(lang: LegalLanguage): LegalSection[] {
  return HEADINGS[lang].map((heading, idx) => {
    const n = idx + 1;
    const extra = EXTRA_PARAGRAPHS[lang][n];
    return { heading, paragraphs: extra ? [PLACEHOLDER[lang], extra] : [PLACEHOLDER[lang]] };
  });
}

const DPA_2026_10_01_DRAFT: PlatformDocument = {
  version: '2026-10-01-draft',
  isDraft: true,
  publishedAt: '2026-10-01',
  title: { de: 'Auftragsverarbeitungsvertrag (ENTWURF)', en: 'Data processing agreement (DRAFT)' },
  sections: { de: buildSections('de'), en: buildSections('en') },
};

/** Append a new version; never edit a published one. */
export const DPA_VERSIONS: readonly PlatformDocument[] = [DPA_2026_10_01_DRAFT];
export const CURRENT_DPA: PlatformDocument = DPA_VERSIONS[DPA_VERSIONS.length - 1];

export const DPA_CHANGED_ERROR =
  'The data processing agreement has changed — reload and accept the current version';

export interface SubProcessor {
  id: 'azure' | 'entra' | 'acs';
  name: string;
  purpose: Record<LegalLanguage, string>;
  location: Record<LegalLanguage, string>;
}

export const SUB_PROCESSORS: readonly SubProcessor[] = [
  {
    id: 'azure',
    name: 'Microsoft Ireland Operations Ltd. — Microsoft Azure',
    purpose: { de: 'Hosting, Datenbank und Dateispeicher', en: 'Hosting, database and file storage' },
    location: { de: 'EU (Region West Europe, Niederlande)', en: 'EU (West Europe region, Netherlands)' },
  },
  {
    id: 'entra',
    name: 'Microsoft Ireland Operations Ltd. — Microsoft Entra External ID',
    purpose: { de: 'Anmeldung der Restaurantbetreiber', en: 'Sign-in for restaurant owners' },
    location: { de: 'EU', en: 'EU' },
  },
  {
    id: 'acs',
    name: 'Microsoft Ireland Operations Ltd. — Azure Communication Services',
    purpose: { de: 'Versand von Bestell-E-Mails', en: 'Sending order emails' },
    location: { de: 'EU', en: 'EU' },
  },
];

export const STRIPE_PRIVACY_URL: Record<LegalLanguage, string> = {
  de: 'https://stripe.com/de/privacy',
  en: 'https://stripe.com/privacy',
};
