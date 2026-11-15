export interface PushPublicKeyDto {
  publicKey: string | null; // VAPID public key; null = push not configured
}

export interface SubscribePushRequestDto {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface SubscribePushResultDto {
  id: string;
}

export interface UnsubscribePushRequestDto {
  endpoint: string;
}

export interface UnsubscribePushResultDto {
  ok: true;
}
