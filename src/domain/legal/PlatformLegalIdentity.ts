import { EMAIL_PATTERN } from './impressum';

export interface PlatformLegalIdentity {
  id: 'platform_legal_identity';
  platformName: string;
  salesSiteUrl: string | null;
  operator: { legalName: string; address: string; email: string };
  euRepresentative: { name: string; address: string; email: string } | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

export const DEFAULT_PLATFORM_LEGAL_IDENTITY: PlatformLegalIdentity = {
  id: 'platform_legal_identity',
  platformName: 'Fair Technology',
  salesSiteUrl: null,
  operator: { legalName: '', address: '', email: '' },
  euRepresentative: null,
  updatedAt: null,
  updatedBy: null,
};

export function isPlatformIdentityComplete(p: PlatformLegalIdentity): boolean {
  return [p.platformName, p.operator.legalName, p.operator.address, p.operator.email].every(
    (v) => (v ?? '').trim() !== '',
  );
}

const MAX = 300;
const OPERATOR_KEYS = ['legalName', 'address', 'email'] as const;
const REPRESENTATIVE_KEYS = ['name', 'address', 'email'] as const;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function validatePlatformIdentityInput(
  input: unknown,
): Pick<PlatformLegalIdentity, 'platformName' | 'salesSiteUrl' | 'operator' | 'euRepresentative'> | string {
  const raw = isPlainObject(input) ? input : {};

  const name = typeof raw.platformName === 'string' ? raw.platformName.trim() : '';
  if (name === '' || name.length > 80) return 'platformName is required (max 80 characters)';

  let salesSiteUrl: string | null = null;
  if (raw.salesSiteUrl !== null && raw.salesSiteUrl !== undefined) {
    const url = typeof raw.salesSiteUrl === 'string' ? raw.salesSiteUrl.trim() : '';
    if (url !== '') {
      let valid = false;
      try {
        valid = new URL(url).protocol === 'https:';
      } catch {
        valid = false;
      }
      if (!valid) return 'salesSiteUrl must be an https URL or null';
      salesSiteUrl = url;
    }
  }

  const rawOperator = isPlainObject(raw.operator) ? raw.operator : {};
  const operator = { legalName: '', address: '', email: '' };
  for (const key of OPERATOR_KEYS) {
    const v = rawOperator[key];
    if (typeof v !== 'string' || v.trim().length > MAX) {
      return `operator.${key} must be a string of at most ${MAX} characters`;
    }
    operator[key] = v.trim();
  }
  if (operator.email !== '' && !EMAIL_PATTERN.test(operator.email)) {
    return 'operator.email is not a valid email address';
  }

  let euRepresentative: PlatformLegalIdentity['euRepresentative'] = null;
  if (raw.euRepresentative !== null && raw.euRepresentative !== undefined) {
    const shapeError = 'euRepresentative must be null or an object with name, address and email';
    if (!isPlainObject(raw.euRepresentative)) return shapeError;
    const rep = { name: '', address: '', email: '' };
    for (const key of REPRESENTATIVE_KEYS) {
      const v = raw.euRepresentative[key];
      if (typeof v !== 'string' || v.trim().length > MAX) return shapeError;
      rep[key] = v.trim();
    }
    if (rep.email !== '' && !EMAIL_PATTERN.test(rep.email)) {
      return 'euRepresentative.email is not a valid email address';
    }
    // An all-blank form means "no representative appointed yet".
    euRepresentative = rep.name === '' && rep.address === '' && rep.email === '' ? null : rep;
  }

  return { platformName: name, salesSiteUrl, operator, euRepresentative };
}
