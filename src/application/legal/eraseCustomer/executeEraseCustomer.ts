import { HttpRequest } from '@azure/functions';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import {
  findOrdersByShopIdAndCustomerEmail,
  replaceOrder,
} from '../../../infrastructure/cosmos/order/CosmosOrderRepository';
import { CLOSED_ORDER_STATES, anonymiseOrder } from '../../../domain/legal/erasure';
import { EMAIL_PATTERN } from '../../../domain/legal/impressum';
import { logAudit } from '../../_shared/auditHelpers';
import { authorizeShopAction, toAuditActor } from '../../_shared/shopAccess';
import { ApplicationResult } from '../../_shared/types';
import { OWNER_ONLY_ERROR } from '../acceptDpa/executeAcceptDpa';
import { EraseCustomerResultDto } from '../dtos';

export async function executeEraseCustomer(
  input: { shopId: string; email: unknown; now?: Date },
  httpRequest: HttpRequest,
): Promise<ApplicationResult<EraseCustomerResultDto>> {
  if (!input.shopId || input.shopId.trim() === '') {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required' };
  }
  if (typeof input.email !== 'string' || !EMAIL_PATTERN.test(input.email.trim())) {
    return { ok: false, code: 'INVALID_INPUT', error: 'email must be a valid email address' };
  }
  const email = input.email.trim().toLowerCase();

  try {
    const shop = await findShopById(input.shopId.trim());
    if (!shop || shop.isDeleted) {
      return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
    }
    const access = await authorizeShopAction(httpRequest, shop, null);
    if (!access.ok) return access;
    if (access.actor.actorType !== 'owner') {
      return { ok: false, code: 'FORBIDDEN', error: OWNER_ONLY_ERROR };
    }

    const orders = (await findOrdersByShopIdAndCustomerEmail(shop.id, email)).filter((o) => !o.anonymisedAt);

    const open = orders
      .filter((o) => !CLOSED_ORDER_STATES.includes(o.state))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))[0];
    if (open) {
      return {
        ok: false,
        code: 'CONFLICT',
        error: `This customer has an open order (${open.orderRef}). Finish or cancel it first.`,
      };
    }

    const now = (input.now ?? new Date()).toISOString();
    for (const o of orders) {
      await replaceOrder(anonymiseOrder(o, now));
    }

    // Audited even with zero matches, so the restaurant can show it handled the request.
    // No email or name in the entry: the audit log must hold no personal content.
    await logAudit({
      shopId: shop.id,
      ...toAuditActor(access.actor),
      action: 'customer.erase',
      entityType: 'customer',
      entityId: crypto.randomUUID(),
      entityName: `${orders.length} orders anonymised`,
    });

    return { ok: true, data: { anonymisedOrderCount: orders.length } };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to erase customer data' };
  }
}
