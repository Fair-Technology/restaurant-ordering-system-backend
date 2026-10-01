import { HttpRequest } from '@azure/functions';
import { findShopById, updateShop } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { getPlatformLegalIdentity } from '../../../infrastructure/cosmos/system/CosmosPlatformLegalIdentityRepository';
import { CURRENT_DPA, DPA_CHANGED_ERROR } from '../../../domain/legal/platformDocuments';
import { DpaAcceptance } from '../../../domain/shop/Shop';
import { logAudit } from '../../_shared/auditHelpers';
import { authorizeShopAction, toAuditActor } from '../../_shared/shopAccess';
import { ApplicationResult } from '../../_shared/types';
import { ShopLegalSettingsDto } from '../dtos';
import { toShopLegalSettingsDto } from '../toShopLegalSettingsDto';

export const OWNER_ONLY_ERROR = 'Only the restaurant owner can do this';

export async function executeAcceptDpa(
  input: { shopId: string; version: string; now?: Date },
  httpRequest: HttpRequest,
): Promise<ApplicationResult<ShopLegalSettingsDto>> {
  if (!input.shopId || input.shopId.trim() === '') {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required' };
  }

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

    if (input.version !== CURRENT_DPA.version) {
      return { ok: false, code: 'INVALID_INPUT', error: DPA_CHANGED_ERROR };
    }

    const now = (input.now ?? new Date()).toISOString();
    const acceptance: DpaAcceptance = {
      version: input.version,
      acceptedAt: now,
      acceptedByUserId: access.actor.actorId,
      shopNameAtAcceptance: shop.name,
    };
    const saved = await updateShop({
      ...shop,
      dpaAcceptance: acceptance,
      dpaAcceptanceHistory: [...(shop.dpaAcceptanceHistory ?? []), acceptance],
      updatedAt: now,
    });
    await logAudit({
      shopId: shop.id,
      ...toAuditActor(access.actor),
      action: 'shop.dpa_accept',
      entityType: 'shop',
      entityId: shop.id,
      entityName: shop.name,
      changes: [{ field: 'dpaVersion', from: shop.dpaAcceptance?.version ?? null, to: input.version }],
    });

    return { ok: true, data: toShopLegalSettingsDto(saved, await getPlatformLegalIdentity(), true) };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to record acceptance' };
  }
}
