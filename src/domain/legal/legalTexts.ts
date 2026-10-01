import { StoredImpressum } from './impressum';

export type LegalTextKind = 'terms' | 'withdrawal' | 'privacyAddition';
export const LEGAL_TEXT_MAX_CHARS: Record<LegalTextKind, number> = {
  terms: 20000,
  withdrawal: 10000,
  privacyAddition: 5000,
};
export const MIN_LEGAL_TEXT_CHARS = 50; // terms + withdrawal only

export interface LegalText {
  text: string;
  revision: number;
  updatedAt: string;
  updatedBy: string;
}

export interface LegalTextRevision extends LegalText {
  kind: LegalTextKind;
}

export interface ShopLegal {
  impressum: StoredImpressum | null;
  terms: LegalText | null;
  withdrawal: LegalText | null;
  privacyAddition: LegalText | null;
  revisions: LegalTextRevision[]; // superseded texts only, oldest first
}

export const EMPTY_SHOP_LEGAL: ShopLegal = {
  impressum: null,
  terms: null,
  withdrawal: null,
  privacyAddition: null,
  revisions: [],
};

export function legalOf(shop: { legal?: ShopLegal | null }): ShopLegal {
  return shop.legal ?? structuredClone(EMPTY_SHOP_LEGAL);
}

/** text is trimmed first. '' → next null. Same trimmed text as current → { next: current, archived: null }.
 *  Different → a new revision, with the previous text returned as archived. */
export function nextLegalText(
  current: LegalText | null,
  text: string,
  now: string,
  by: string,
): { next: LegalText | null; archived: LegalText | null } {
  const trimmed = text.trim();
  if (trimmed === '') return { next: null, archived: current };
  if (current && current.text === trimmed) return { next: current, archived: null };
  return {
    next: { text: trimmed, revision: (current?.revision ?? 0) + 1, updatedAt: now, updatedBy: by },
    archived: current,
  };
}

export function isLegalTextPublished(t: LegalText | null | undefined): boolean {
  return (t?.text.trim().length ?? 0) >= MIN_LEGAL_TEXT_CHARS;
}
