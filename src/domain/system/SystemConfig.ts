export interface SystemConfig {
  id: 'global'; // fixed singleton document
  maxShopsDefault: number; // -1 = unlimited
  emailEnabled: boolean; // platform order-email switch; absent/unknown reads as false
  scheduleHorizonDays: number; // whole days a diner may book ahead, 1-6, default 4
  updatedAt: string;
}
