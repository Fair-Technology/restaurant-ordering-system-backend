import { HttpRequest } from '@azure/functions';
import { findShopById } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { findCategoriesByShopId } from '../../../infrastructure/cosmos/category/CosmosCategoryRepository';
import { findProductsByShopId } from '../../../infrastructure/cosmos/product/CosmosProductRepository';
import { findOrdersByShopId } from '../../../infrastructure/cosmos/order/CosmosOrderRepository';
import { legalOf } from '../../../domain/legal/legalTexts';
import { menuLanguagesOf } from '../../../domain/menu/menuLanguage';
import { logAudit } from '../../_shared/auditHelpers';
import { authorizeShopAction, toAuditActor } from '../../_shared/shopAccess';
import { ApplicationResult } from '../../_shared/types';
import { OWNER_ONLY_ERROR } from '../acceptDpa/executeAcceptDpa';
import { ExportOrder, ShopDataExportDto } from '../dtos';
import { deriveCustomers, stripCosmosMeta } from './deriveCustomers';

export async function executeExportShopData(
  input: { shopId: string; now?: Date },
  httpRequest: HttpRequest,
): Promise<ApplicationResult<ShopDataExportDto>> {
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

    const [categories, products, orders] = await Promise.all([
      findCategoriesByShopId(shop.id),
      findProductsByShopId(shop.id),
      findOrdersByShopId(shop.id),
    ]);

    const legal = legalOf(shop);
    let impressum: ShopDataExportDto['shop']['impressum'] = null;
    if (legal.impressum) {
      const { updatedAt: _a, updatedBy: _b, ...fields } = legal.impressum;
      impressum = fields;
    }

    const exportOrders = orders.map((o): ExportOrder => {
      const {
        customerNotes: _notes,
        customerAccessToken: _token,
        idempotencyKey: _key,
        ...rest
      } = stripCosmosMeta(o);
      return rest;
    });

    const data: ShopDataExportDto = {
      formatVersion: 1,
      exportedAt: (input.now ?? new Date()).toISOString(),
      shop: {
        id: shop.id,
        slug: shop.slug,
        name: shop.name,
        countryCode: shop.countryCode,
        currency: shop.currency,
        timezone: shop.timezone,
        address: shop.address,
        openingHours: shop.openingHours,
        menuLanguages: menuLanguagesOf(shop),
        impressum,
        terms: legal.terms?.text ?? null,
        withdrawal: legal.withdrawal?.text ?? null,
        privacyAddition: legal.privacyAddition?.text ?? null,
      },
      categories: categories.filter((c) => !c.isDeleted).map(stripCosmosMeta),
      products: products.filter((p) => !p.isDeleted).map(stripCosmosMeta),
      orders: exportOrders,
      customers: deriveCustomers(orders),
    };

    await logAudit({
      shopId: shop.id,
      ...toAuditActor(access.actor),
      action: 'shop.data_export',
      entityType: 'shop',
      entityId: shop.id,
      entityName: shop.name,
    });

    return { ok: true, data };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to export data' };
  }
}
