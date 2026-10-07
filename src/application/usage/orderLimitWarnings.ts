import { legalOf } from '../../domain/legal/legalTexts';
import { menuLanguagesOf } from '../../domain/menu/menuLanguage';
import type { Shop } from '../../domain/shop/Shop';
import { limitOf } from '../../domain/subscription/entitlements';
import { crossedLevels } from '../../domain/usage/orderLimit';
import type { ShopUsage } from '../../domain/usage/ShopUsage';
import { findUserById } from '../../infrastructure/cosmos/user/CosmosUserRepository';
import { sendEmail } from '../../infrastructure/email/emailSender';
import { loadEntitlements } from '../_shared/entitlements';
import { PLAN_LIMIT_KEYS } from '../_shared/planLimitKeys';
import { render } from '../order/notifications/emailTemplates';
import type { OrderEmailContent } from '../order/notifications/emailTemplates';

export function buildOrderLimitEmail(input: {
  shop: Pick<Shop, 'name' | 'menuLanguages'>;
  level: 80 | 90 | 95 | 100;
  count: number;
  limit: number;
  subscriptionUrl: string;
}): OrderEmailContent {
  const { shop, level, count, limit, subscriptionUrl } = input;
  const de = menuLanguagesOf(shop)[0] === 'de';
  const stopped = level === 100;
  const subject = stopped
    ? de
      ? `${shop.name}: Bestelllimit erreicht – Online-Bestellungen pausiert`
      : `${shop.name}: order limit reached – online ordering paused`
    : de
      ? `${shop.name}: ${level} % Ihres monatlichen Bestelllimits erreicht`
      : `${shop.name}: ${level}% of your monthly order limit used`;
  const second = stopped
    ? de
      ? 'Ihr Shop nimmt bis zum Monatsende keine Online-Bestellungen mehr an. Mit einem Upgrade geht es sofort weiter.'
      : 'Your shop takes no more online orders until the end of the month. An upgrade lets you trade again immediately.'
    : de
      ? `Bei ${limit} Bestellungen pausiert Ihr Shop bis zum Monatsende. Ein Upgrade gilt sofort.`
      : `At ${limit} orders your shop pauses until the end of the month. An upgrade takes effect immediately.`;
  return render(subject, [
    {
      type: 'p',
      text: de
        ? `Diesen Monat wurden ${count} von ${limit} Bestellungen angenommen.`
        : `${count} of ${limit} orders accepted this month.`,
    },
    { type: 'p', text: second },
    { type: 'p', text: `${de ? 'Tarif ändern' : 'Change plan'}: ${subscriptionUrl}` },
  ]);
}

/** Active owners' email addresses; the Impressum address when no owner has one. */
export async function ownerRecipients(shop: Pick<Shop, 'members' | 'legal'>): Promise<string[]> {
  const seen = new Set<string>();
  const emails: string[] = [];
  for (const m of shop.members) {
    if (!m.isActive || m.role !== 'owner') continue;
    const email = (await findUserById(m.userId))?.email?.trim();
    if (!email || seen.has(email.toLowerCase())) continue;
    seen.add(email.toLowerCase());
    emails.push(email);
  }
  if (emails.length > 0) return emails;
  const fallback = legalOf(shop).impressum?.email?.trim();
  return fallback ? [fallback] : [];
}

/** After an accepted order is counted: emails the owners when this order crossed 80/90/95/100%. Never throws. */
export async function notifyOrderLimitThresholds(shop: Shop, after: ShopUsage, now: Date): Promise<void> {
  try {
    const limit = limitOf(await loadEntitlements(shop.id, now), PLAN_LIMIT_KEYS.ORDERS_PER_MONTH);
    const levels = crossedLevels(after.acceptedOrderCount - 1, after.acceptedOrderCount, limit);
    if (limit === null || levels.length === 0) return;
    const to = await ownerRecipients(shop);
    if (to.length === 0) return;
    const url = `${process.env.ADMIN_APP_URL ?? 'http://localhost:5173'}/shops/${shop.id}/subscription`;
    await sendEmail({
      to,
      ...buildOrderLimitEmail({ shop, level: levels[levels.length - 1], count: after.acceptedOrderCount, limit, subscriptionUrl: url }),
      replyTo: null,
      tag: 'order_limit_warning',
    });
  } catch {
    console.error('[email:error]', 'order_limit_warning');
  }
}
