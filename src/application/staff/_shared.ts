import {
  StaffAccount,
  StaffRole,
  STAFF_USERNAME_PATTERN,
  STAFF_PASSWORD_MIN,
  STAFF_PASSWORD_MAX,
} from '../../domain/staff/StaffAccount';
import { ShopActor } from '../_shared/shopAccess';

export interface StaffAccountDto {
  id: string;
  username: string;
  displayName: string | null;
  role: StaffRole;
  isActive: boolean;
  isLocked: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export function toDto(acc: StaffAccount, now: Date): StaffAccountDto {
  return {
    id: acc.id,
    username: acc.username,
    displayName: acc.displayName,
    role: acc.role,
    isActive: acc.isActive,
    isLocked: acc.lockedUntil !== null && Date.parse(acc.lockedUntil) > now.getTime(),
    lastLoginAt: acc.lastLoginAt,
    createdAt: acc.createdAt,
  };
}

// A Manager may only manage staff-role logins, and can never grant or edit a
// manager. Only the Owner manages Managers.
export function canManage(actor: ShopActor, targetRole: StaffRole): boolean {
  return actor.role === 'owner' || (actor.role === 'manager' && targetRole === 'staff');
}

export const CANNOT_MANAGE_ERROR = 'Managers can only manage staff logins';

export function validateUsername(value: unknown): string | null {
  if (typeof value !== 'string' || !STAFF_USERNAME_PATTERN.test(value)) {
    return 'username must be 3–32 characters: lowercase letters, digits, dot, dash or underscore';
  }
  return null;
}

export function validatePassword(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    value.length < STAFF_PASSWORD_MIN ||
    value.length > STAFF_PASSWORD_MAX
  ) {
    return 'password must be between 8 and 128 characters';
  }
  return null;
}

export function validateRole(value: unknown): string | null {
  if (value !== 'manager' && value !== 'staff') {
    return "role must be 'manager' or 'staff'";
  }
  return null;
}
