import { StaffRole } from '../../../domain/staff/StaffAccount';
import { StaffAccountDto } from '../_shared';

export interface CreateStaffRequestDto {
  shopId: string;
  username: string;
  password: string;
  role: StaffRole;
  displayName?: string | null;
}

export type CreateStaffResultDto = StaffAccountDto;
