import { ImpressumFields, LegalLanguage } from './impressum';
import { PlatformLegalIdentity } from './PlatformLegalIdentity';
import { LegalSection, STRIPE_PRIVACY_URL, SUB_PROCESSORS } from './platformDocuments';

export const PRIVACY_TEMPLATE_VERSION = '2026-10-01-draft';

export interface PrivacyNotice {
  templateVersion: string;
  isDraft: boolean;
  sections: LegalSection[];
}

/** Placeholder wording, not reviewed by a lawyer; the notice is always marked as a draft. */
export function buildPrivacyNotice(input: {
  lang: LegalLanguage;
  impressum: ImpressumFields;
  identity: PlatformLegalIdentity;
  privacyAddition: string | null;
}): PrivacyNotice {
  const { lang, impressum: i, identity, privacyAddition } = input;
  const de = lang === 'de';
  const address = `${i.street}, ${i.postcode} ${i.city}, ${i.country}`;
  const operatorAddress = identity.operator.address;

  const sections: LegalSection[] = [
    {
      heading: de ? 'Verantwortlicher' : 'Controller',
      paragraphs: de
        ? [
            `${i.legalName}, ${address}.`,
            `Telefon: ${i.phone}. E-Mail: ${i.email}.`,
            'Das Restaurant ist für die Daten der Gäste verantwortlich, die über diese Bestellseite erhoben werden.',
          ]
        : [
            `${i.legalName}, ${address}.`,
            `Phone: ${i.phone}. Email: ${i.email}.`,
            'The restaurant is responsible for the diner data collected through this ordering site.',
          ],
    },
    {
      heading: de ? 'Welche Daten wir verarbeiten und warum' : 'What data we process and why',
      paragraphs: de
        ? [
            'Wir verarbeiten Name, E-Mail-Adresse, Telefonnummer, den Inhalt der Bestellung und optional Hinweise für die Küche.',
            'Das geschieht, um die Bestellung anzunehmen, zuzubereiten und zu übergeben und um Sie dazu zu kontaktieren (Art. 6 Abs. 1 lit. b DSGVO).',
            'Bitte geben Sie in den Hinweisen keine Gesundheitsdaten ein.',
          ]
        : [
            'We process your name, email address, phone number, the contents of your order and, optionally, kitchen notes.',
            'We do this to take, prepare and hand over your order and to contact you about it (Art. 6(1)(b) GDPR).',
            "Please don't enter health information in the notes.",
          ],
    },
    {
      heading: de ? 'Auftragsverarbeiter' : 'Processor',
      paragraphs: de
        ? [
            `${identity.operator.legalName}, ${operatorAddress}, betreibt die Bestellsoftware für das Restaurant.`,
            'Das geschieht als Auftragsverarbeiter nach Art. 28 DSGVO und nur auf Weisung des Restaurants. Die Daten werden in der EU gespeichert.',
          ]
        : [
            `${identity.operator.legalName}, ${operatorAddress}, runs the ordering software for the restaurant.`,
            'It does so as a processor under Art. 28 GDPR and only on the restaurant’s instructions. The data is stored in the EU.',
          ],
    },
    {
      heading: de ? 'Unterauftragsverarbeiter' : 'Sub-processors',
      paragraphs: SUB_PROCESSORS.map((s) => `${s.name} — ${s.purpose[lang]} (${s.location[lang]})`),
    },
    {
      heading: de ? 'Kartenzahlungen' : 'Card payments',
      paragraphs: de
        ? [
            'Stripe verarbeitet Karten- und PayPal-Daten als eigenständiger Verantwortlicher.',
            `Die Datenschutzhinweise von Stripe finden Sie unter ${STRIPE_PRIVACY_URL.de}.`,
          ]
        : [
            'Stripe processes card and PayPal data as an independent controller.',
            `Stripe’s privacy notice is at ${STRIPE_PRIVACY_URL.en}.`,
          ],
    },
    {
      heading: de ? 'Speicherung auf Ihrem Gerät' : 'Storage on your device',
      paragraphs: de
        ? [
            'In Ihrem Browser speichern wir nur Ihren Warenkorb und, wenn Sie es wünschen, Ihre Angaben für die nächste Bestellung.',
            'Wir verwenden keine Tracking-Cookies und keine Analysewerkzeuge.',
          ]
        : [
            'We store only your basket and, if you ask us to, your details for next time in your browser.',
            'We use no tracking cookies and no analytics.',
          ],
    },
    {
      heading: de ? 'Speicherdauer' : 'How long data is kept',
      paragraphs: de
        ? [
            'Wir speichern Bestelldaten so lange, wie das Steuer- und Handelsrecht das Restaurant zur Aufbewahrung verpflichtet.',
            'Danach werden sie gelöscht oder anonymisiert.',
          ]
        : [
            'We keep order data for as long as tax and commercial law requires the restaurant to keep order records.',
            'After that it is deleted or anonymised.',
          ],
    },
    {
      heading: de ? 'Ihre Rechte' : 'Your rights',
      paragraphs: de
        ? [
            'Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch.',
            'Wenden Sie sich dazu an das Restaurant. Sie haben außerdem das Recht, sich bei einer Datenschutzaufsichtsbehörde zu beschweren.',
          ]
        : [
            'You have the right of access, correction, erasure, restriction of processing, data portability and objection.',
            'Contact the restaurant to use them. You also have the right to complain to a data-protection authority.',
          ],
    },
  ];

  const addition = privacyAddition?.trim() ?? '';
  if (addition !== '') {
    sections.push({
      heading: de ? `Ergänzende Hinweise von ${i.legalName}` : `Additional information from ${i.legalName}`,
      paragraphs: addition.split(/\n\s*\n/),
    });
  }

  return { templateVersion: PRIVACY_TEMPLATE_VERSION, isDraft: true, sections };
}
