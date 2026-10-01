import { StaffAccountDto } from '../_shared';

export interface ListStaffRequestDto {
  shopId: string;
}

export interface ListStaffResultDto {
  staff: StaffAccountDto[];
  limit: number | null;
  activeCount: number;
}
