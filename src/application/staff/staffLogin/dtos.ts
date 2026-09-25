import { StaffRole } from '../../../domain/staff/StaffAccount';

export interface StaffLoginRequestDto {
  shopSlug: string;
  username: string;
  password: string;
}

export interface StaffLoginResultDto {
  token: string;
  expiresAt: string;
  shopId: string;
  shopSlug: string;
  staffId: string;
  username: string;
  role: StaffRole;
}
