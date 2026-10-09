import type { HttpRequest } from '@azure/functions';
import { mergeLoyaltyRule } from '../../../domain/promotion/promotions';
import { logAudit } from '../../_shared/auditHelpers';
import type { ApplicationResult } from '../../_shared/types';
import { authorizePromotions } from '../authorizePromotions';
import { loadPromotionsDto } from '../loadPromotionsDto';
import { mutatePromotions } from '../mutatePromotions';
import type { PromotionsDto } from '../dtos';

const AUDITED = ['enabled', 'everyOrders', 'rewardCents', 'validDays'] as const;

/** Saves the loyalty rule; fields not sent are kept, and the count restarts whenever loyalty is switched on. */
export async function executeUpdateLoyalty(
  input: { shopId: string; body?: Record<string, unknown>; now?: Date },
  httpRequest: HttpRequest,
): Promise<ApplicationResult<PromotionsDto>> {
  try {
    const auth = await authorizePromotions(input.shopId, httpRequest);
    if (!auth.ok) return auth;
    const now = input.now ?? new Date();
    const result = await mutatePromotions(
      auth.shop.id,
      (doc) => {
        const merged = mergeLoyaltyRule(doc.loyalty, input.body ?? {}, now);
        if ('error' in merged) return { error: { ok: false, code: 'INVALID_INPUT', error: merged.error } };
        return { ...doc, loyalty: merged };
      },
      now,
    );
    if (!result.ok) return result;
    const before = result.before.loyalty;
    const after = result.after.loyalty!;
    const changes = AUDITED.filter((f) => (before ? before[f] : undefined) !== after[f]).map((f) => ({
      field: f,
      from: before ? before[f] : null,
      to: after[f],
    }));
    await logAudit({
      shopId: auth.shop.id,
      ...auth.audit,
      action: 'promotion.loyalty_update',
      entityType: 'shop',
      entityId: auth.shop.id,
      entityName: auth.shop.name,
      changes,
    });
    return { ok: true, data: await loadPromotionsDto(auth.shop.id) };
  } catch {
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to update loyalty' };
  }
}
