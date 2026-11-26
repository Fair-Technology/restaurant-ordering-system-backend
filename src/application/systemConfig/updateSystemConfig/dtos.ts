export interface UpdateSystemConfigRequestDto {
  maxShopsDefault?: number;
  emailEnabled?: boolean;
  scheduleHorizonDays?: number;
}

export interface UpdateSystemConfigResultDto {
  maxShopsDefault: number;
  emailEnabled: boolean;
  scheduleHorizonDays: number;
}
