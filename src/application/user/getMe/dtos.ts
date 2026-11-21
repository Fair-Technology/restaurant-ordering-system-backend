import { MenuLanguage } from '../../../domain/reference/ReferenceLists';

export interface GetMeResultDto {
  id: string;
  email?: string;
  name?: string;
  /**
   * Present only for platform operators: 'write' (Owner/Support) or 'read' (ReadOnly).
   * Derived from the verified token's app roles, never from a stored flag. Clients should
   * gate write controls on this field.
   */
  platformAccess?: 'read' | 'write';
  /** Interface language chosen by this account; absent until chosen. */
  language?: MenuLanguage;
  /**
   * The language of the earliest shop this owner belongs to (member, active), derived from
   * its country via defaultMenuLanguageForCountry. Absent for platform operators and for an
   * owner with no shop yet. Used by the frontend as the first-sign-in fallback when the
   * browser's language isn't supported.
   */
  restaurantLanguage?: MenuLanguage;
  createdAt: string;
  updatedAt: string;
}
