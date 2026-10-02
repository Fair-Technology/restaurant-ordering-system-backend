import { missingImpressumFields } from '../../domain/legal/impressum';
import { legalCriteria } from '../../domain/legal/legalReadiness';
import { LegalText, legalOf } from '../../domain/legal/legalTexts';
import { CURRENT_DPA } from '../../domain/legal/platformDocuments';
import { isPlatformIdentityComplete, PlatformLegalIdentity } from '../../domain/legal/PlatformLegalIdentity';
import { Shop } from '../../domain/shop/Shop';
import { LegalTextDto, ShopLegalSettingsDto } from './dtos';

function toTextDto(t: LegalText | null): LegalTextDto | null {
  return t ? { text: t.text, revision: t.revision, updatedAt: t.updatedAt } : null;
}

export function toShopLegalSettingsDto(
  shop: Shop,
  identity: PlatformLegalIdentity,
  callerIsOwner: boolean,
): ShopLegalSettingsDto {
  const legal = legalOf(shop);
  const met = legalCriteria(shop, identity).map((c) => c.met);
  let impressum: ShopLegalSettingsDto['impressum'] = null;
  if (legal.impressum) {
    const { updatedAt: _a, updatedBy: _b, ...fields } = legal.impressum;
    impressum = fields;
  }
  return {
    impressum,
    terms: toTextDto(legal.terms),
    withdrawal: toTextDto(legal.withdrawal),
    privacyAddition: toTextDto(legal.privacyAddition),
    missingImpressumFields: missingImpressumFields(impressum),
    completeness: { dpa: met[0], impressum: met[1], terms: met[2], withdrawal: met[3], privacyNotice: met[4] },
    dpa: {
      currentVersion: CURRENT_DPA.version,
      currentIsDraft: CURRENT_DPA.isDraft,
      accepted: shop.dpaAcceptance ?? null,
    },
    platformIdentityComplete: isPlatformIdentityComplete(identity),
    callerIsOwner,
  };
}
