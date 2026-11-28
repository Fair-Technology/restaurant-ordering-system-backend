import type { Order, OrderActor } from '../../../domain/order/Order';
import type { AuditActorType } from '../../../domain/audit/AuditEntry';
import { logAudit } from '../../_shared/auditHelpers';

/** Audit entries never carry guest data: just the order ref and the actor. 'system' covers every automatic path. */
function orderActorToAuditActor(actor: OrderActor): { actorType: AuditActorType; actorId: string } {
  if (actor.type === 'owner' || actor.type === 'staff' || actor.type === 'superadmin') {
    return { actorType: actor.type, actorId: actor.id };
  }
  return { actorType: 'system', actorId: 'system' };
}

export async function logOrderAccept(shopId: string, order: Pick<Order, 'id' | 'orderRef'>, actor: OrderActor): Promise<void> {
  await logAudit({
    shopId,
    ...orderActorToAuditActor(actor),
    action: 'order.accept',
    entityType: 'order',
    entityId: order.id,
    entityName: order.orderRef,
  });
}

export async function logOrderDecline(shopId: string, order: Pick<Order, 'id' | 'orderRef'>, actor: OrderActor): Promise<void> {
  await logAudit({
    shopId,
    ...orderActorToAuditActor(actor),
    action: 'order.decline',
    entityType: 'order',
    entityId: order.id,
    entityName: order.orderRef,
  });
}
