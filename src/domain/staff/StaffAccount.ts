export type StaffRole = 'manager' | 'staff';

export interface StaffAccount {
  id: string;
  shopId: string; // Cosmos partition key; unique key on /username within the partition

  username: string; // lowercase, unique per shop
  displayName: string | null;
  role: StaffRole;

  passwordHash: string; // 'scrypt$<N>$<r>$<p>$<saltB64>$<keyB64>'

  isActive: boolean;
  isDeleted: boolean; // soft delete: identity blanked, history kept

  failedLoginCount: number;
  lockedUntil: string | null; // ISO; null when not locked
  lastLoginAt: string | null; // ISO; null until first login

  createdBy: string; // actorId of the owner/manager who created this account
  createdAt: string;
  updatedAt: string;
}

export const STAFF_USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;
export const STAFF_PASSWORD_MIN = 8;
export const STAFF_PASSWORD_MAX = 128;
export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MINUTES = 15;
