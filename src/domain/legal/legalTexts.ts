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

export interface InvoiceLegalExtras {
  managingDirector: string; // Geschäftsführer; '' = not given
  court: string; // Amtsgericht; '' = not given
  registerNumber: string; // HRB number; '' = not given
  iban: string; // '' = not given
  bic: string; // '' = not given
}

export const INVOICE_LEGAL_EXTRAS_MAX_CHARS = 300;

export interface ShopLegal {
  impressum: StoredImpressum | null;
  terms: LegalText | null;
  withdrawal: LegalText | null;
  privacyAddition: LegalText | null;
  revisions: LegalTextRevision[]; // superseded texts only, oldest first
  taxNumber?: string; // private Steuernummer for invoices; never printed in the Impressum
  invoiceLegalExtras?: InvoiceLegalExtras | null; // optional invoice-only extras; independent of the Impressum
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

/** The seller's tax ids as printed on invoices; '' when not set. */
export function invoiceTaxIdsOf(shop: { legal?: ShopLegal | null }): { vatId: string; taxNumber: string } {
  const legal = legalOf(shop);
  return {
    vatId: legal.impressum?.vatId?.trim() ?? '',
    taxNumber: legal.taxNumber?.trim() ?? '',
  };
}

/** An invoice needs a VAT ID or a tax number (section 14 UStG). */
export function hasInvoiceTaxId(shop: { legal?: ShopLegal | null }): boolean {
  const ids = invoiceTaxIdsOf(shop);
  return ids.vatId !== '' || ids.taxNumber !== '';
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

const INVOICE_EXTRAS_KEYS: readonly (keyof InvoiceLegalExtras)[] = [
  'managingDirector',
  'court',
  'registerNumber',
  'iban',
  'bic',
];

const IBAN_PATTERN = /^[A-Z]{2}[0-9A-Z]{13,32}$/;
const BIC_PATTERN = /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/;

/** All fields optional free text; '' allowed for every one. iban/bic normalised
 *  (spaces removed, upper-cased) and format-checked only when non-empty. */
export function validateInvoiceLegalExtrasInput(input: unknown): InvoiceLegalExtras | string {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return 'invoiceLegalExtras must be an object';
  }
  const raw = input as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const key of INVOICE_EXTRAS_KEYS) {
    const v = raw[key];
    if (typeof v !== 'string' || v.trim().length > INVOICE_LEGAL_EXTRAS_MAX_CHARS) {
      return `invoiceLegalExtras.${key} must be a string of at most ${INVOICE_LEGAL_EXTRAS_MAX_CHARS} characters`;
    }
    out[key] = v.trim();
  }
  out.iban = out.iban.replace(/\s+/g, '').toUpperCase();
  if (out.iban !== '' && !IBAN_PATTERN.test(out.iban)) {
    return 'invoiceLegalExtras.iban is not a valid IBAN';
  }
  out.bic = out.bic.replace(/\s+/g, '').toUpperCase();
  if (out.bic !== '' && !BIC_PATTERN.test(out.bic)) {
    return 'invoiceLegalExtras.bic is not a valid BIC';
  }
  return out as unknown as InvoiceLegalExtras;
}

/** true when every field is '' (nothing to store / show). */
export function isInvoiceLegalExtrasEmpty(e: InvoiceLegalExtras): boolean {
  return INVOICE_EXTRAS_KEYS.every((k) => e[k] === '');
}
