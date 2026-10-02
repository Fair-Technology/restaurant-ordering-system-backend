import { findShopBySlug } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { getPlatformLegalIdentity } from '../../../infrastructure/cosmos/system/CosmosPlatformLegalIdentityRepository';
import { buildImpressumLines, isImpressumComplete, LegalLanguage } from '../../../domain/legal/impressum';
import { isLegalTextPublished, legalOf, LegalText } from '../../../domain/legal/legalTexts';
import { isPlatformIdentityComplete } from '../../../domain/legal/PlatformLegalIdentity';
import { buildPrivacyNotice } from '../../../domain/legal/privacyNotice';
import { defaultMenuLanguageForCountry } from '../../../domain/menu/menuLanguage';
import { ApplicationResult } from '../../_shared/types';
import { LegalTextDto, PublicLegalPackDto } from '../dtos';

function publishedTextDto(t: LegalText | null): LegalTextDto | null {
  return t && isLegalTextPublished(t) ? { text: t.text, revision: t.revision, updatedAt: t.updatedAt } : null;
}

// No paused check, by design: an Impressum must be reachable whenever the site is.
export async function executeGetPublicLegalPack(input: {
  slug: string;
  lang?: string | null;
}): Promise<ApplicationResult<PublicLegalPackDto>> {
  if (!input.slug || input.slug.trim() === '') {
    return { ok: false, code: 'INVALID_INPUT', error: 'slug is required' };
  }
  try {
    const shop = await findShopBySlug(input.slug.trim());
    if (!shop) {
      return { ok: false, code: 'NOT_FOUND', error: 'Shop not found' };
    }

    const language: LegalLanguage =
      input.lang === 'de' || input.lang === 'en' ? input.lang : defaultMenuLanguageForCountry(shop.countryCode ?? '');
    const legal = legalOf(shop);
    const identity = await getPlatformLegalIdentity();
    const impressum = isImpressumComplete(legal.impressum) ? legal.impressum : null;

    return {
      ok: true,
      data: {
        slug: shop.slug,
        shopName: shop.name,
        language,
        impressum: impressum ? { lines: buildImpressumLines(impressum, language) } : null,
        terms: publishedTextDto(legal.terms),
        withdrawal: publishedTextDto(legal.withdrawal),
        privacyNotice:
          impressum && isPlatformIdentityComplete(identity)
            ? buildPrivacyNotice({
                lang: language,
                impressum,
                identity,
                privacyAddition: legal.privacyAddition?.text ?? null,
              })
            : null,
        seller: {
          legalName: impressum ? impressum.legalName : shop.name,
          phone: impressum ? impressum.phone : null,
        },
        platform: { name: identity.platformName, salesSiteUrl: identity.salesSiteUrl },
      },
    };
  } catch {
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to load legal pages' };
  }
}
