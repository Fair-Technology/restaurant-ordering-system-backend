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
  createdAt: string;
  updatedAt: string;
}
