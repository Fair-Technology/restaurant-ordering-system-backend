import { HttpRequest } from '@azure/functions';
import { findShopById, updateShop } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { getPlatformLegalIdentity } from '../../../infrastructure/cosmos/system/CosmosPlatformLegalIdentityRepository';
import { ImpressumFieldKey, StoredImpressum, validateImpressumInput } from '../../../domain/legal/impressum';
import {
  LEGAL_TEXT_MAX_CHARS,
  LegalTextKind,
  ShopLegal,
  legalOf,
  nextLegalText,
} from '../../../domain/legal/legalTexts';
import { AuditChange } from '../../../domain/audit/AuditEntry';
import { logAudit } from '../../_shared/auditHelpers';
import { authorizeShopAction, toAuditActor } from '../../_shared/shopAccess';
import { ApplicationResult } from '../../_shared/types';
import { ShopLegalSettingsDto, UpdateShopLegalBody } from '../dtos';
import { toShopLegalSettingsDto } from '../toShopLegalSettingsDto';

const TEXT_KINDS: readonly LegalTextKind[] = ['terms', 'withdrawal', 'privacyAddition'];

export async function executeUpdateShopLegal(
  input: { shopId: string; body: UpdateShopLegalBody; now?: Date },
  httpRequest: HttpRequest,
): Promise<ApplicationResult<ShopLegalSettingsDto>> {
  if (!input.shopId || input.shopId.trim() === '') {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopId is required' };
  }
  const body = input.body;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, code: 'INVALID_INPUT', error: 'Request body must be an object' };
  }

  try {
    const shop = await findShopById(input.shopId.trim());
    if (!shop || shop.isDeleted) {
      return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
    }
    const access = await authorizeShopAction(httpRequest, shop, 'manage_shop');
    if (!access.ok) return access;

    const nowIso = (input.now ?? new Date()).toISOString();
    const by = access.actor.actorId;
    const current = legalOf(shop);
    const legal: ShopLegal = { ...current, revisions: [...current.revisions] };
    const changes: AuditChange[] = [];

    if (body.impressum !== undefined) {
      const valid = validateImpressumInput(body.impressum, shop.countryCode ?? '');
      if (typeof valid === 'string') {
        return { ok: false, code: 'INVALID_INPUT', error: valid };
      }
      const before = current.impressum;
      for (const key of Object.keys(valid) as ImpressumFieldKey[]) {
        // Field names only: the audit log must hold no personal content.
        if ((before?.[key] ?? '') !== valid[key]) {
          changes.push({ field: `impressum.${key}`, from: null, to: null });
        }
      }
      if (changes.length > 0 || before === null) {
        legal.impressum = { ...valid, updatedAt: nowIso, updatedBy: by } as StoredImpressum;
      }
    }

    for (const kind of TEXT_KINDS) {
      const text = body[kind];
      if (text === undefined) continue;
      const max = LEGAL_TEXT_MAX_CHARS[kind];
      if (typeof text !== 'string' || text.length > max) {
        return { ok: false, code: 'INVALID_INPUT', error: `${kind} must be text of at most ${max} characters` };
      }
      const old = current[kind];
      const { next, archived } = nextLegalText(old, text, nowIso, by);
      if (next === old) continue;
      if (archived) legal.revisions.push({ ...archived, kind });
      legal[kind] = next;
      changes.push({ field: kind, from: old?.revision ?? null, to: next?.revision ?? null });
    }

    const identity = await getPlatformLegalIdentity();
    const isOwner = access.actor.actorType === 'owner';
    if (changes.length === 0 && legal.impressum === current.impressum) {
      return { ok: true, data: toShopLegalSettingsDto(shop, identity, isOwner) };
    }

    const saved = await updateShop({ ...shop, legal, updatedAt: nowIso });
    await logAudit({
      shopId: shop.id,
      ...toAuditActor(access.actor),
      action: 'shop.legal_update',
      entityType: 'shop',
      entityId: shop.id,
      entityName: shop.name,
      changes,
    });

    return { ok: true, data: toShopLegalSettingsDto(saved, identity, isOwner) };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to update legal settings' };
  }
}
