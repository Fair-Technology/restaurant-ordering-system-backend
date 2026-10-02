import { MenuLanguage } from '../reference/ReferenceLists';

export type LegalLanguage = MenuLanguage;

export const LEGAL_FORMS = ['sole_trader', 'ek', 'gbr', 'ohg', 'kg', 'gmbh', 'ug', 'other'] as const;
export type LegalForm = (typeof LEGAL_FORMS)[number];

export interface ImpressumFields {
  legalName: string;
  legalForm: LegalForm;
  representatives: string;
  street: string;
  postcode: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  registerCourt: string;
  registerNumber: string;
  vatId: string;
  supervisoryAuthority: string; // '' = not given
}

export type ImpressumFieldKey = keyof ImpressumFields;

export interface StoredImpressum extends ImpressumFields {
  updatedAt: string;
  updatedBy: string;
}

export const IMPRESSUM_MAX_FIELD_CHARS = 300;
export const FORMS_NEEDING_REPRESENTATIVES: readonly LegalForm[] = ['gbr', 'ohg', 'kg', 'gmbh', 'ug'];
export const FORMS_NEEDING_REGISTER: readonly LegalForm[] = ['ek', 'ohg', 'kg', 'gmbh', 'ug'];
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const DE_VAT_PATTERN = /^DE\d{9}$/;

const FIELD_KEYS: readonly ImpressumFieldKey[] = [
  'legalName',
  'legalForm',
  'representatives',
  'street',
  'postcode',
  'city',
  'country',
  'phone',
  'email',
  'registerCourt',
  'registerNumber',
  'vatId',
  'supervisoryAuthority',
];

const BASE_REQUIRED_KEYS: readonly ImpressumFieldKey[] = [
  'legalName',
  'street',
  'postcode',
  'city',
  'country',
  'phone',
  'email',
];

/** Validates shape/format of supplied values; empty strings allowed (completeness is separate).
 *  Returns the normalised fields (every string trimmed; vatId spaces removed + upper-cased) or an error string. */
export function validateImpressumInput(input: unknown, countryCode: string): ImpressumFields | string {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return 'impressum must be an object';
  }
  const raw = input as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const key of FIELD_KEYS) {
    const v = raw[key];
    if (typeof v !== 'string' || v.trim().length > IMPRESSUM_MAX_FIELD_CHARS) {
      return `impressum.${key} must be a string of at most ${IMPRESSUM_MAX_FIELD_CHARS} characters`;
    }
    out[key] = v.trim();
  }
  if (!(LEGAL_FORMS as readonly string[]).includes(out.legalForm)) {
    return `impressum.legalForm must be one of ${LEGAL_FORMS.join(', ')}`;
  }
  if (out.email !== '' && !EMAIL_PATTERN.test(out.email)) {
    return 'impressum.email is not a valid email address';
  }
  out.vatId = out.vatId.replace(/\s+/g, '').toUpperCase();
  if (out.vatId !== '' && countryCode.toUpperCase() === 'DE' && !DE_VAT_PATTERN.test(out.vatId)) {
    return 'impressum.vatId must look like DE followed by 9 digits';
  }
  return out as unknown as ImpressumFields;
}

/** Required: legalName, street, postcode, city, country, phone, email (all non-empty after trim; email matches EMAIL_PATTERN);
 *  representatives if the form needs them; register court + number if the form needs a register entry. */
export function missingImpressumFields(i: ImpressumFields | null | undefined): ImpressumFieldKey[] {
  if (!i) return [...BASE_REQUIRED_KEYS];
  const filled = (k: ImpressumFieldKey): boolean => (i[k] ?? '').trim() !== '';
  const missing: ImpressumFieldKey[] = [];
  for (const key of FIELD_KEYS) {
    let required = BASE_REQUIRED_KEYS.includes(key);
    if (key === 'representatives') required = FORMS_NEEDING_REPRESENTATIVES.includes(i.legalForm);
    if (key === 'registerCourt' || key === 'registerNumber') required = FORMS_NEEDING_REGISTER.includes(i.legalForm);
    if (!required) continue;
    if (!filled(key) || (key === 'email' && !EMAIL_PATTERN.test(i.email.trim()))) missing.push(key);
  }
  return missing;
}

export function isImpressumComplete(i: ImpressumFields | null | undefined): boolean {
  return missingImpressumFields(i).length === 0;
}

export interface ImpressumLine {
  label: string;
  value: string;
}

const LABELS: Record<LegalLanguage, Record<string, string>> = {
  de: {
    provider: 'Anbieter',
    address: 'Anschrift',
    representatives: 'Vertreten durch',
    phone: 'Telefon',
    email: 'E-Mail',
    registerCourt: 'Registergericht',
    registerNumber: 'Registernummer',
    vatId: 'Umsatzsteuer-Identifikationsnummer',
    supervisoryAuthority: 'Aufsichtsbehörde',
  },
  en: {
    provider: 'Provider',
    address: 'Address',
    representatives: 'Represented by',
    phone: 'Phone',
    email: 'Email',
    registerCourt: 'Register court',
    registerNumber: 'Register number',
    vatId: 'VAT ID',
    supervisoryAuthority: 'Supervisory authority',
  },
};

/** Fixed order; optional lines omitted when ''. */
export function buildImpressumLines(i: ImpressumFields, lang: LegalLanguage): ImpressumLine[] {
  const l = LABELS[lang];
  const lines: Array<[string, string]> = [
    [l.provider, i.legalName],
    [l.address, `${i.street}, ${i.postcode} ${i.city}, ${i.country}`],
    [l.representatives, i.representatives],
    [l.phone, i.phone],
    [l.email, i.email],
    [l.registerCourt, i.registerCourt],
    [l.registerNumber, i.registerNumber],
    [l.vatId, i.vatId],
    [l.supervisoryAuthority, i.supervisoryAuthority],
  ];
  return lines.filter(([, value]) => value !== '').map(([label, value]) => ({ label, value }));
}
