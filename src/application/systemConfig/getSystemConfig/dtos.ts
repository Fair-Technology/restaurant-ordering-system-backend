export interface GetSystemConfigResultDto {
  maxShopsDefault: number;
  emailEnabled: boolean;
  emailTransportConfigured: boolean; // read-only: true when the ACS transport is fully configured, whatever the switch says
}
