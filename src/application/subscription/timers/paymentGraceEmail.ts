import { menuLanguagesOf } from '../../../domain/menu/menuLanguage';
import type { Shop } from '../../../domain/shop/Shop';
import { render } from '../../order/notifications/emailTemplates';
import type { OrderEmailContent } from '../../order/notifications/emailTemplates';

/** The warning sent while a payment is failing; n is which of the three this is. */
export function buildPaymentGraceEmail(input: {
  shop: Pick<Shop, 'name' | 'menuLanguages' | 'timezone'>;
  n: 1 | 2 | 3;
  graceEndsAt: string;
  defaultPlanName: string;
  defaultOrderLimit: number | null; // null = unlimited
  url: string;
}): OrderEmailContent {
  const { shop, n, graceEndsAt, defaultPlanName, defaultOrderLimit, url } = input;
  const de = menuLanguagesOf(shop)[0] === 'de';
  const date = new Intl.DateTimeFormat(de ? 'de-DE' : 'en-GB', { dateStyle: 'medium', timeZone: shop.timezone }).format(new Date(graceEndsAt));
  const lastReminder = n === 3 ? (de ? 'Letzte Erinnerung: ' : 'Final reminder: ') : '';
  const limit =
    defaultOrderLimit === null ? '' : de ? ` (${defaultOrderLimit} Bestellungen pro Monat)` : ` (${defaultOrderLimit} orders a month)`;
  const subject = de
    ? `${lastReminder}${shop.name}: Zahlung fehlgeschlagen – bitte bis ${date} aktualisieren`
    : `${lastReminder}${shop.name}: Payment failed – please update by ${date}`;
  return render(subject, [
    {
      type: 'p',
      text: de
        ? `Die letzte Zahlung für Ihren Tarif ist fehlgeschlagen. Wenn bis ${date} nicht gezahlt wird, wechselt Ihr Shop auf ${defaultPlanName}${limit}. Es wird nichts gelöscht; nach der Zahlung ist alles sofort wieder da.`
        : `Your last plan payment failed. If it is not paid by ${date}, your shop moves to ${defaultPlanName}${limit}. Nothing is deleted; everything comes back the moment you pay.`,
    },
    { type: 'p', text: `${de ? 'Zahlung aktualisieren' : 'Update payment'}: ${url}` },
  ]);
}
