import type { HttpRequest } from '@azure/functions';
import type { ApplicationResult } from '../../_shared/types';
import { authorizePromotions } from '../authorizePromotions';
import { countsAsUse } from '../../../domain/promotion/promotions';
import { findDiscountUseRows, findOrderById } from '../../../infrastructure/cosmos/order/CosmosOrderRepository';
import { countVouchersByShop, findVouchersByShopPaginated } from '../../../infrastructure/cosmos/promotion/CosmosPromotionRepository';
import { logServiceFailure } from '../../_shared/logServiceFailure';
import type { GetLoyaltyVouchersRequestDto, GetLoyaltyVouchersResultDto, LoyaltyVoucherDto } from './dtos';

/** The restaurant's issued loyalty vouchers, newest first, with whether each was used. */
export async function executeGetLoyaltyVouchers(
  request: GetLoyaltyVouchersRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<GetLoyaltyVouchersResultDto>> {
  const page = request.page ?? 1;
  const pageSize = request.pageSize ?? 20;

  if (!Number.isInteger(page) || page < 1) {
    return { ok: false, code: 'INVALID_INPUT', error: 'page must be a positive integer', errorCode: 'PAGE_INVALID', field: 'page' };
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      error: 'pageSize must be a positive integer no greater than 100',
      errorCode: 'PAGE_SIZE_INVALID',
      field: 'pageSize',
    };
  }

  try {
    const auth = await authorizePromotions(request.shopId, httpRequest, { allowPlatformRead: true });
    if (!auth.ok) return auth;
    const shopId = auth.shop.id;

    const [docs, total] = await Promise.all([
      findVouchersByShopPaginated(shopId, page, pageSize),
      countVouchersByShop(shopId),
    ]);

    const vouchers: LoyaltyVoucherDto[] = await Promise.all(
      docs.map(async (doc) => {
        const [useRows, order] = await Promise.all([
          findDiscountUseRows(shopId, doc.code),
          findOrderById(doc.sourceOrderId),
        ]);
        return {
          code: doc.code,
          amountCents: doc.amountCents,
          issuedAt: doc.createdAt,
          expiresOn: doc.expiresOn,
          used: useRows.some(countsAsUse),
          orderRef: order ? order.orderRef : null,
        };
      }),
    );

    return { ok: true, data: { vouchers, total, page, pageSize } };
  } catch (error) {
    logServiceFailure('getLoyaltyVouchers', error);
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to load loyalty vouchers' };
  }
}
