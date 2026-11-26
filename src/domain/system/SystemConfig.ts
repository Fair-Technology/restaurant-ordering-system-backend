export interface SystemConfig {
  id: 'global'; // fixed singleton document
  maxShopsDefault: number; // -1 = unlimited
  emailEnabled: boolean; // platform order-email switch; absent/unknown reads as false
  updatedAt: string;
}
