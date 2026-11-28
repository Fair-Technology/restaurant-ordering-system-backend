import { HttpRequest } from '@azure/functions';
import {
  findShopById,
  isSlugReservedByAnother,
  updateShop,
} from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { authorizeShopAction, toAuditActor } from '../../_shared/shopAccess';
import { SLUG_EMPTY_MESSAGE, generateSlugFromName, validateSlugFormat } from '../createShop/slugHelpers';
import { logAudit } from '../../_shared/auditHelpers';
import { ApplicationResult } from '../../_shared/types';
import { RequestShopNameChangeRequestDto, RequestShopNameChangeResultDto } from './dtos';
import { logServiceFailure } from '../../_shared/logServiceFailure';

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

  if (request.requestedName.trim().length > 80) {
    return { ok: false, code: 'INVALID_INPUT', error: 'requestedName must be at most 80 characters long' };
  }

  try {
    const shop = await findShopById(request.shopId.trim());
    if (!shop) {
      return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
    }

    const access = await authorizeShopAction(httpRequest, shop, 'manage_shop');
    if (!access.ok) return access;
    const userId = access.actor.actorId;

    if (shop.pendingNameChange) {
      return { ok: false, code: 'CONFLICT', error: 'A name change request is already pending', errorCode: 'SHOP_NAME_CHANGE_PENDING' };
    }

    const requestedSlug = generateSlugFromName(request.requestedName.trim());

    if (requestedSlug === '') {
      return { ok: false, code: 'INVALID_INPUT', error: SLUG_EMPTY_MESSAGE };
    }
    const slugFormatError = validateSlugFormat(requestedSlug);
    if (slugFormatError) {
      return { ok: false, code: 'INVALID_INPUT', error: slugFormatError };
    }

    if (requestedSlug === shop.slug) {
      return {
        ok: false,
        code: 'INVALID_INPUT',
        error: 'The requested name generates the same slug as the current name',
        errorCode: 'SHOP_NAME_SAME_SLUG',
        field: 'requestedName',
      };
    }

    const reserved = await isSlugReservedByAnother(requestedSlug, shop.id);
    if (reserved) {
      return { ok: false, code: 'CONFLICT', error: 'A shop with this name already exists', errorCode: 'SHOP_NAME_EXISTS', field: 'name' };
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
      ...toAuditActor(access.actor),
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
    logServiceFailure('requestShopNameChange', error);
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to request shop name change' };
  }
}
