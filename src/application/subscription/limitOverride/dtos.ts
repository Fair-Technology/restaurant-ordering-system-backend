import { ShopSubscription } from '../../../domain/subscription/ShopSubscription';

export interface SetLimitOverrideRequestDto {
  limits: { key: string; value: number }[];
  reason: string;
  expiresAt?: string | null;
}

export interface LimitOverrideResultDto {
  subscription: ShopSubscription;
}
