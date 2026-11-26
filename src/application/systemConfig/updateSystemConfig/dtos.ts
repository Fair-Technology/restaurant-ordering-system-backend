export interface UpdateSystemConfigRequestDto {
  maxShopsDefault?: number;
  emailEnabled?: boolean;
}

export interface UpdateSystemConfigResultDto {
  maxShopsDefault: number;
  emailEnabled: boolean;
}
