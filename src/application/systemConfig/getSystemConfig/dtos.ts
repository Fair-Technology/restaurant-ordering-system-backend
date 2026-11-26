export interface GetSystemConfigResultDto {
  maxShopsDefault: number;
  emailEnabled: boolean;
  scheduleHorizonDays: number;
  emailTransportConfigured: boolean; // read-only: true when the ACS transport is fully configured, whatever the switch says
}
