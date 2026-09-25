import { HttpRequest } from '@azure/functions';
import {
  findShopById,
  updateShop,
} from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { verifySuperAdminToken } from '../../../infrastructure/auth/superAdminAuthHelpers';
import { checkIsOwner } from '../../_shared/permissions';
import { getActorFromAuth, logAudit } from '../../_shared/auditHelpers';
import { ApplicationResult } from '../../_shared/types';
import { RejectShopNameChangeRequestDto, RejectShopNameChangeResultDto } from './dtos';

export async function executeRejectShopNameChange(
  request: RejectShopNameChangeRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<RejectShopNameChangeResultDto>> {
  if (!request.shopId || typeof request.shopId !== 'string' || request.shopId.trim() === '') {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required' };
  }

  try {
    const shop = await findShopById(request.shopId.trim());
    if (!shop) {
      return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
    }

    if (!shop.pendingNameChange) {
      return { ok: false, code: 'NOT_FOUND', error: 'No pending name change request found' };
    }

    // Allow superadmin OR the owner who originally submitted the request
    let actorId: string;
    let actorType: 'owner' | 'superadmin';

    const superAdminId = await verifySuperAdminToken(httpRequest);
    if (superAdminId) {
      actorId = superAdminId;
      actorType = 'superadmin';
    } else {
      let actor: { userId: string; email?: string; name?: string };
      try {
        actor = await getActorFromAuth(httpRequest);
      } catch {
        return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
      }

      const ownerError = checkIsOwner(shop, actor.userId);
      const isRequester = shop.pendingNameChange.requestedBy === actor.userId;

      if (ownerError || !isRequester) {
        return {
          ok: false,
          code: 'FORBIDDEN',
          error: 'Only the requesting owner or a superadmin can cancel this request',
        };
      }

      actorId = actor.userId;
      actorType = 'owner';
    }

    const rejectedName = shop.pendingNameChange.requestedName;

    const updatedShop = {
      ...shop,
      pendingNameChange: null,
      updatedAt: new Date().toISOString(),
    };

    const result = await updateShop(updatedShop);

    await logAudit({
      shopId: result.id,
      actorType,
      actorId,
      action: 'shop.nameChange.rejected',
      entityType: 'shop',
      entityId: result.id,
      entityName: result.name,
      changes: [{ field: 'pendingNameChange', from: rejectedName, to: null }],
    });

    return {
      ok: true,
      data: {
        id: result.id,
        updatedAt: result.updatedAt,
      },
    };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to reject shop name change' };
  }
}
