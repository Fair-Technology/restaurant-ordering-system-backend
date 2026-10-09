import type { HttpRequest } from '@azure/functions';
import { DISCOUNT_ACTIVE_ERROR, DISCOUNT_CODE_NOT_FOUND_ERROR } from '../../../domain/promotion/promotions';
import { logAudit } from '../../_shared/auditHelpers';
import type { ApplicationResult } from '../../_shared/types';
import { authorizePromotions } from '../authorizePromotions';
import { loadPromotionsDto } from '../loadPromotionsDto';
import { mutatePromotions } from '../mutatePromotions';
import type { PromotionsDto } from '../dtos';

/** Switches one discount code on or off. */
export async function executeSetDiscountCodeActive(
  input: { shopId: string; body?: Record<string, unknown>; codeId?: string; now?: Date },
  httpRequest: HttpRequest,
): Promise<ApplicationResult<PromotionsDto>> {
  try {
    const auth = await authorizePromotions(input.shopId, httpRequest);
    if (!auth.ok) return auth;
    const active = input.body?.active;
    if (typeof active !== 'boolean') return { ok: false, code: 'INVALID_INPUT', error: DISCOUNT_ACTIVE_ERROR };
    const now = input.now ?? new Date();
    const result = await mutatePromotions(
      auth.shop.id,
      (doc) => {
        if (!doc.codes.some((c) => c.id === input.codeId)) {
          return { error: { ok: false, code: 'NOT_FOUND', error: DISCOUNT_CODE_NOT_FOUND_ERROR } };
        }
        return { ...doc, codes: doc.codes.map((c) => (c.id === input.codeId ? { ...c, active } : c)) };
      },
      now,
    );
    if (!result.ok) return result;
    const code = result.before.codes.find((c) => c.id === input.codeId)!;
    await logAudit({
      shopId: auth.shop.id,
      ...auth.audit,
      action: 'promotion.code_update',
      entityType: 'shop',
      entityId: auth.shop.id,
      entityName: auth.shop.name,
      changes: [{ field: `${code.code} active`, from: code.active, to: active }],
    });
    return { ok: true, data: await loadPromotionsDto(auth.shop.id) };
  } catch {
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to update discount code' };
  }
}
