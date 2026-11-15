export interface DeleteOptionGroupRequestDto {
  shopId: string;
  groupId: string;
}

export interface DeleteOptionGroupResultDto {
  id: string;
  shopId: string;
  name: string;
  isDeleted: boolean;
  updatedAt: string;
}
