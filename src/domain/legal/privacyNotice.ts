import { ImpressumFields, LegalLanguage } from './impressum';
import { PlatformLegalIdentity } from './PlatformLegalIdentity';
import { LegalSection, STRIPE_PRIVACY_URL, SUB_PROCESSORS } from './platformDocuments';

export const PRIVACY_TEMPLATE_VERSION = '2026-10-13-draft';
export const PRIVACY_IS_DRAFT = true; // flip to false (and drop '-draft' from the version) once Manish approves

export interface PrivacyNotice {
  templateVersion: string;
  isDraft: boolean;
  sections: LegalSection[];
}

/** Draft wording by Claude, reviewed by Manish before `PRIVACY_IS_DRAFT` is set to false. */
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
            'Wir verarbeiten Name, E-Mail-Adresse, Telefonnummer, den Inhalt der Bestellung, optional Hinweise für die Küche und – wenn angegeben oder bei Bestellungen über 250 € erforderlich – Ihre Rechnungsadresse. Rechnungen mit Name und Adresse bewahrt das Restaurant acht Jahre auf. Bei Lieferbestellungen zusätzlich Ihre Lieferadresse; alle Mitarbeitenden des Restaurants, die Bestellungen bearbeiten, sehen sie und Ihre Telefonnummer, damit geliefert werden kann. Die Lieferadresse steht nicht auf der Rechnung.',
            'Das geschieht, um die Bestellung anzunehmen, zuzubereiten und zu übergeben und um Sie dazu zu kontaktieren (Art. 6 Abs. 1 lit. b DSGVO).',
            'Bitte geben Sie in den Hinweisen keine Gesundheitsdaten ein.',
            'Wenn Sie einen Rabatt- oder Gutscheincode einlösen, speichern wir ihn mit der Bestellung. Bietet das Restaurant Treuegutscheine an, zählen wir Ihre angenommenen Bestellungen anhand Ihrer E-Mail-Adresse. Einen Gutschein per E-Mail senden wir nur, wenn Sie das bei der Bestellung ankreuzen (Art. 6 Abs. 1 lit. a DSGVO); ohne Häkchen bei der nächsten Bestellung kommt keiner.',
          ]
        : [
            'We process your name, email address, phone number, the contents of your order, optionally kitchen notes and – if you give it, or for orders over €250 – your billing address. The restaurant keeps invoices with your name and address for eight years. For delivery orders we also process your delivery address; everyone at the restaurant who handles orders sees it and your phone number so the order can be delivered. The delivery address is not printed on the invoice.',
            'We do this to take, prepare and hand over your order and to contact you about it (Art. 6(1)(b) GDPR).',
            "Please don't enter health information in the notes.",
            'If you redeem a discount or voucher code, we store it with the order. If the restaurant offers loyalty vouchers, we count your accepted orders by your email address. We email you a voucher only if you tick the box when ordering (Art. 6(1)(a) GDPR); leave it unticked next time and none is sent.',
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
      heading: de ? 'Zahlung' : 'Payment',
      paragraphs: de
        ? [
            'Sie bezahlen online per Karte, Apple Pay oder Google Pay. Die Zahlung wickelt Stripe ab. Ihre vollständigen Karten- und Zahlungsdaten gehen direkt von Ihrem Browser an Stripe und laufen nicht über die Bestellsoftware.',
            'Stripe verarbeitet diese Zahlungsdaten als eigenständiger Verantwortlicher.',
            'Ihre Zahlungsdaten werden nicht für spätere Bestellungen gespeichert, und es wird kein Kundenkonto bei Stripe angelegt.',
            'Für die Zahlung lädt diese Seite erst im Zahlungsschritt das Programm Stripe.js von den Servern von Stripe. Stripe.js übermittelt dabei Angaben zu Ihrem Gerät, Ihrem Browser und Ihrer Nutzung der Seite an Stripe, damit Stripe Betrug erkennen kann.',
            `Die Datenschutzhinweise von Stripe finden Sie unter ${STRIPE_PRIVACY_URL.de}.`,
          ]
        : [
            'You pay online by card, Apple Pay or Google Pay. Stripe handles the payment. Your full card and payment details go directly from your browser to Stripe and do not pass through the ordering software.',
            'Stripe processes this payment data as an independent controller.',
            'Your payment details are not saved for later orders, and no customer account is created at Stripe.',
            'To take the payment, this site loads Stripe’s Stripe.js script from Stripe’s servers at the payment step only. Stripe.js sends Stripe information about your device, your browser and how you use the page so that Stripe can detect fraud.',
            `Stripe’s privacy notice is at ${STRIPE_PRIVACY_URL.en}.`,
          ],
    },
    {
      heading: de ? 'Speicherung auf Ihrem Gerät' : 'Storage on your device',
      paragraphs: de
        ? [
            'Ihren Warenkorb speichern wir im lokalen Speicher Ihres Browsers (localStorage), getrennt für jedes Restaurant, damit er beim nächsten Öffnen der Seite noch da ist. Er enthält nur die gewählten Gerichte mit Größe, Extras, Menüauswahl, Menge und Preis, aber keine Angaben zu Ihrer Person. Nach einer Bestellung oder wenn Sie ihn leeren, ist er leer.',
            'Nur für den aktuellen Browser-Tab (sessionStorage) merken wir uns außerdem die Tischnummer, wenn Sie einen Tisch-QR-Code gescannt haben, und die Postleitzahl, die Sie für eine Lieferung gewählt haben (beides wird nach zwei Stunden nicht mehr verwendet), sowie ob Sie den Hinweis, dass das Restaurant geschlossen hat, bereits weggeklickt haben. Öffnet das Restaurant die Seite als Vorschau in seiner Verwaltung, merkt sich der Tab auch das. Diese Angaben verschwinden, wenn Sie den Tab schließen.',
            'Name, E-Mail-Adresse, Telefonnummer und Adressen aus dem Bestellformular speichern wir nicht in Ihrem Browser, mit Ausnahme der oben genannten Postleitzahl.',
            'Wir selbst setzen keine Cookies. Erst im Zahlungsschritt setzt Stripe eigene Cookies (__stripe_mid und __stripe_sid), um Betrug bei der Zahlung zu verhindern. Sie sind für die Zahlung unbedingt erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG). Tracking-Cookies und Analysewerkzeuge verwenden wir nicht.',
          ]
        : [
            'We keep your basket in your browser’s local storage (localStorage), separately for each restaurant, so it is still there the next time you open the site. It holds only the dishes you chose, with size, extras, combo choices, quantity and price, and nothing about you. After you order, or when you empty it, it is empty.',
            'For the current browser tab only (sessionStorage) we also remember your table number if you scanned a table QR code, the postcode you chose for delivery (neither is used after two hours), and whether you have dismissed the notice that the restaurant is closed. When the restaurant opens the site as a preview in its admin, the tab remembers that too. This information is gone when you close the tab.',
            'Your name, email address, phone number and addresses from the order form are not stored in your browser, apart from the postcode above.',
            'We set no cookies ourselves. Only at the payment step does Stripe set its own cookies (__stripe_mid and __stripe_sid) to prevent payment fraud. They are strictly necessary for the payment (§ 25(2) no. 2 TDDDG). We use no tracking cookies and no analytics.',
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

  return { templateVersion: PRIVACY_TEMPLATE_VERSION, isDraft: PRIVACY_IS_DRAFT, sections };
}
