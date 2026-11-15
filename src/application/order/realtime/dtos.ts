export interface RealtimeConnectionDto {
  url: string | null; // null = live channel not configured: the client keeps polling
  accessToken: string | null;
}
