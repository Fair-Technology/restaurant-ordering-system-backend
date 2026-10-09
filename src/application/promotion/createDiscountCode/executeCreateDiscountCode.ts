import { randomUUID } from 'crypto';
import type { HttpRequest } from '@azure/functions';
import {
  DISCOUNT_CODE_EXISTS_ERROR,
  DISCOUNT_CODE_LIMIT_ERROR,
  MAX_CODES,
  parseNewDiscountCode,
} from '../../../domain/promotion/promotions';
import { logAudit } from '../../_shared/auditHelpers';
import type { ApplicationResult } from '../../_shared/types';
import { authorizePromotions } from '../authorizePromotions';
import { loadPromotionsDto } from '../loadPromotionsDto';
import { mutatePromotions } from '../mutatePromotions';
import type { PromotionsDto } from '../dtos';

/** Adds a discount code. Codes cannot be edited or deleted afterwards: switch one off and make a new one. */
export async function executeCreateDiscountCode(
  input: { shopId: string; body?: Record<string, unknown>; now?: Date },
  httpRequest: HttpRequest,
): Promise<ApplicationResult<PromotionsDto>> {
  try {
    const auth = await authorizePromotions(input.shopId, httpRequest);
    if (!auth.ok) return auth;
    const now = input.now ?? new Date();
    const parsed = parseNewDiscountCode(input.body ?? {}, { id: randomUUID(), now });
    if ('error' in parsed) return { ok: false, code: 'INVALID_INPUT', error: parsed.error };
    const result = await mutatePromotions(
      auth.shop.id,
      (doc) => {
        if (doc.codes.length >= MAX_CODES) {
          return { error: { ok: false, code: 'INVALID_INPUT', error: DISCOUNT_CODE_LIMIT_ERROR } };
        }
        if (doc.codes.some((c) => c.code === parsed.code)) {
          return { error: { ok: false, code: 'CONFLICT', error: DISCOUNT_CODE_EXISTS_ERROR } };
        }
        return { ...doc, codes: [...doc.codes, parsed] };
      },
      now,
    );
    if (!result.ok) return result;
    await logAudit({
      shopId: auth.shop.id,
      ...auth.audit,
      action: 'promotion.code_create',
      entityType: 'shop',
      entityId: auth.shop.id,
      entityName: auth.shop.name,
      changes: [{ field: 'code', from: null, to: parsed.code }],
    });
    return { ok: true, data: await loadPromotionsDto(auth.shop.id) };
  } catch {
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to create discount code' };
  }
}
