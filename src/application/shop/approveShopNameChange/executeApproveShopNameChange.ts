import { HttpRequest } from '@azure/functions';
import {
  findShopById,
  updateShop,
} from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { verifySuperAdminToken } from '../../../infrastructure/auth/superAdminAuthHelpers';
import { logAudit } from '../../_shared/auditHelpers';
import { ApplicationResult } from '../../_shared/types';
import { ApproveShopNameChangeRequestDto, ApproveShopNameChangeResultDto } from './dtos';

export async function executeApproveShopNameChange(
  request: ApproveShopNameChangeRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<ApproveShopNameChangeResultDto>> {
  if (!request.shopId || typeof request.shopId !== 'string' || request.shopId.trim() === '') {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required' };
  }

  try {
    const adminId = await verifySuperAdminToken(httpRequest);
    if (!adminId) {
      return { ok: false, code: 'FORBIDDEN', error: 'Superadmin access required' };
    }

    const shop = await findShopById(request.shopId.trim());
    if (!shop) {
      return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
    }

    if (!shop.pendingNameChange) {
      return { ok: false, code: 'NOT_FOUND', error: 'No pending name change request found' };
    }

    const { requestedName, requestedSlug } = shop.pendingNameChange;

    const updatedShop = {
      ...shop,
      name: requestedName,
      slug: requestedSlug,
      pendingNameChange: null,
      updatedAt: new Date().toISOString(),
    };

    const result = await updateShop(updatedShop);

    await logAudit({
      shopId: result.id,
      actorType: 'superadmin',
      actorId: adminId,
      action: 'shop.nameChange.approved',
      entityType: 'shop',
      entityId: result.id,
      entityName: result.name,
      changes: [
        { field: 'name', from: shop.name, to: requestedName },
        { field: 'slug', from: shop.slug, to: requestedSlug },
      ],
    });

    return {
      ok: true,
      data: {
        id: result.id,
        name: result.name,
        slug: result.slug,
        updatedAt: result.updatedAt,
      },
    };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to approve shop name change' };
  }
}
