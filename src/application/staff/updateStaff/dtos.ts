import { StaffRole } from '../../../domain/staff/StaffAccount';
import { StaffAccountDto } from '../_shared';

export interface UpdateStaffRequestDto {
  shopId: string;
  staffId: string;
  role?: StaffRole;
  displayName?: string | null;
  isActive?: boolean;
}

export type UpdateStaffResultDto = StaffAccountDto;
