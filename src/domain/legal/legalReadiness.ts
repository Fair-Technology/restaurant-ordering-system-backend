import { Shop } from '../shop/Shop';
import { isImpressumComplete } from './impressum';
import { isLegalTextPublished, legalOf } from './legalTexts';
import { CURRENT_DPA } from './platformDocuments';
import { isPlatformIdentityComplete, PlatformLegalIdentity } from './PlatformLegalIdentity';

export type LegalCriterionKey = 'dpa_accepted' | 'impressum' | 'terms' | 'withdrawal' | 'privacy_notice';

export const LEGAL_CRITERION_DESCRIPTIONS: Record<LegalCriterionKey, string> = {
  dpa_accepted: 'Data processing agreement accepted (current version)',
  impressum: 'Impressum (legal notice) is complete',
  terms: 'Terms and conditions are published',
  withdrawal: 'Withdrawal policy is published',
  privacy_notice: "Privacy notice can be generated (needs the Impressum and the platform operator's details)",
};

export const LEGAL_GO_LIVE_ERRORS: Record<LegalCriterionKey, string> = {
  dpa_accepted: 'Accept the data processing agreement before going live',
  impressum: 'Complete the Impressum before going live',
  terms: 'Publish your terms and conditions before going live',
  withdrawal: 'Publish your withdrawal policy before going live',
  privacy_notice: 'The privacy notice cannot be generated yet — the platform operator details are missing',
};

export function legalCriteria(
  shop: Shop,
  identity: PlatformLegalIdentity,
): Array<{ key: LegalCriterionKey; met: boolean; description: string }> {
  const legal = legalOf(shop);
  const impressumComplete = isImpressumComplete(legal.impressum);
  const met: Record<LegalCriterionKey, boolean> = {
    dpa_accepted: shop.dpaAcceptance?.version === CURRENT_DPA.version,
    impressum: impressumComplete,
    terms: isLegalTextPublished(legal.terms),
    withdrawal: isLegalTextPublished(legal.withdrawal),
    privacy_notice: impressumComplete && isPlatformIdentityComplete(identity),
  };
  return (Object.keys(LEGAL_CRITERION_DESCRIPTIONS) as LegalCriterionKey[]).map((key) => ({
    key,
    met: met[key],
    description: LEGAL_CRITERION_DESCRIPTIONS[key],
  }));
}

/** Checkout gate: any accepted DPA version is enough here (go-live needs the current one). */
export function isLegalPackComplete(shop: Shop): boolean {
  const legal = legalOf(shop);
  return (
    (shop.dpaAcceptance ?? null) !== null &&
    isImpressumComplete(legal.impressum) &&
    isLegalTextPublished(legal.terms) &&
    isLegalTextPublished(legal.withdrawal)
  );
}

export const LEGAL_PACK_INCOMPLETE_ERROR = 'This restaurant has not finished its legal setup yet';
