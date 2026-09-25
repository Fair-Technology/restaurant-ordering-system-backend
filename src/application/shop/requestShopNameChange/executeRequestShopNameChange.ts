import { HttpRequest } from '@azure/functions';
import {
  findShopById,
  findShopBySlug,
  updateShop,
} from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { checkIsOwner } from '../../_shared/permissions';
import { generateSlugFromName } from '../createShop/slugHelpers';
import { getActorFromAuth, logAudit } from '../../_shared/auditHelpers';
import { ApplicationResult } from '../../_shared/types';
import { RequestShopNameChangeRequestDto, RequestShopNameChangeResultDto } from './dtos';

export async function executeRequestShopNameChange(
  request: RequestShopNameChangeRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<RequestShopNameChangeResultDto>> {
  if (!request.shopId || typeof request.shopId !== 'string' || request.shopId.trim() === '') {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required' };
  }

  if (
    !request.requestedName ||
    typeof request.requestedName !== 'string' ||
    request.requestedName.trim().length < 3
  ) {
    return { ok: false, code: 'INVALID_INPUT', error: 'requestedName must be at least 3 characters' };
  }

  try {
    const actor = await getActorFromAuth(httpRequest);
    const userId = actor.userId;

    const shop = await findShopById(request.shopId.trim());
    if (!shop) {
      return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
    }

    const ownerError = checkIsOwner(shop, userId);
    if (ownerError) return ownerError;

    if (shop.pendingNameChange) {
      return { ok: false, code: 'CONFLICT', error: 'A name change request is already pending' };
    }

    const requestedSlug = generateSlugFromName(request.requestedName.trim());

    if (requestedSlug === shop.slug) {
      return {
        ok: false,
        code: 'INVALID_INPUT',
        error: 'The requested name generates the same slug as the current name',
      };
    }

    const existing = await findShopBySlug(requestedSlug);
    if (existing && existing.id !== shop.id) {
      return { ok: false, code: 'CONFLICT', error: 'A shop with this name already exists' };
    }

    const pendingNameChange = {
      requestedName: request.requestedName.trim(),
      requestedSlug,
      requestedBy: userId,
      requestedAt: new Date().toISOString(),
    };

    const updatedShop = {
      ...shop,
      pendingNameChange,
      updatedAt: new Date().toISOString(),
    };

    const result = await updateShop(updatedShop);

    await logAudit({
      shopId: result.id,
      actorType: 'owner',
      actorId: actor.userId,
      action: 'shop.nameChange.requested',
      entityType: 'shop',
      entityId: result.id,
      entityName: result.name,
      changes: [{ field: 'name', from: shop.name, to: pendingNameChange.requestedName }],
    });

    return {
      ok: true,
      data: {
        id: result.id,
        pendingNameChange: result.pendingNameChange!,
      },
    };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to request shop name change' };
  }
}
