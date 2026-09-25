export interface DeleteStaffRequestDto {
  shopId: string;
  staffId: string;
}

export interface DeleteStaffResultDto {
  id: string;
  deleted: true;
}
