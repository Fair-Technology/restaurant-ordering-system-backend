import type { Order } from '../../../domain/order/Order';
import {
  generateVoucherCode,
  voucherDocId,
  voucherExpiresOn,
  type LoyaltyVoucherDoc,
} from '../../../domain/promotion/promotions';
import type { Shop } from '../../../domain/shop/Shop';
import { countLoyaltyOrders } from '../../../infrastructure/cosmos/order/CosmosOrderRepository';
import { createVoucher, findPromotions } from '../../../infrastructure/cosmos/promotion/CosmosPromotionRepository';
import { notifyLoyaltyVoucher } from '../notifications/notifyOrder';
import { transitionOrder } from '../_shared/transitionOrder';

const ALREADY_ISSUED = 'voucher already issued';

/** After an accepted order: emails a voucher when this is the diner's Nth accepted order and they ticked the box. Never throws. */
export async function issueLoyaltyVoucher(
  order: Order,
  shop: Shop,
  now: Date,
  newCode: () => string = generateVoucherCode,
): Promise<void> {
  try {
    if (!order.loyaltyOptIn || order.loyaltyVoucher || order.customerEmail === '' || !order.acceptedAt) return;
    const rule = (await findPromotions(shop.id))?.loyalty;
    if (!rule || !rule.enabled || !rule.since) return;
    const count = await countLoyaltyOrders(shop.id, order.customerEmail.trim().toLowerCase(), rule.since);
    if (count === 0 || count % rule.everyOrders !== 0) return;
    const code = newCode();
    const voucher: LoyaltyVoucherDoc = {
      id: voucherDocId(shop.id, code),
      kind: 'loyalty_voucher',
      shopId: shop.id,
      code,
      amountCents: rule.rewardCents,
      expiresOn: voucherExpiresOn(now, rule.validDays, shop.timezone),
      sourceOrderId: order.id,
      createdAt: now.toISOString(),
    };
    await createVoucher(voucher);
    let marked: Order | null = null;
    for (let attempt = 0; attempt < 3 && !marked; attempt++) {
      const res = await transitionOrder({
        orderId: order.id,
        shopId: shop.id,
        change: (current) =>
          current.loyaltyVoucher
            ? { ok: false, error: ALREADY_ISSUED }
            : { ok: true, order: { ...current, loyaltyVoucher: { code, issuedAt: now.toISOString() } } },
      });
      if (res.ok) marked = res.order;
      else if (res.error === ALREADY_ISSUED) return;
    }
    if (!marked) {
      console.error('[loyalty:error] could not record the voucher', order.id);
      return;
    }
    await notifyLoyaltyVoucher(marked, shop, voucher, count);
  } catch {
    console.error('[loyalty:error] voucher not issued', order.id);
  }
}
