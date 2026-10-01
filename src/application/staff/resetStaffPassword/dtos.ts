import { StaffAccountDto } from '../_shared';

export interface ResetStaffPasswordRequestDto {
  shopId: string;
  staffId: string;
  password: string;
}

export type ResetStaffPasswordResultDto = StaffAccountDto;
