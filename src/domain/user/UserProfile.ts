import { MenuLanguage } from '../reference/ReferenceLists';

export interface UserProfile {
  id: string; // Entra oid — partition key
  email?: string;
  name?: string;
  maxShops?: number | null; // per-user override; null = use global default; -1 = unlimited
  language?: MenuLanguage; // interface language; undefined = not chosen yet
  createdAt: string;
  updatedAt: string;
}
