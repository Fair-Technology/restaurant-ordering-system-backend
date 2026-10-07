import { ShopSubscription } from '../../../domain/subscription/ShopSubscription';
import { Entitlements } from '../../../domain/subscription/entitlements';
import { Plan } from '../../../domain/plan/Plan';

export interface GetShopSubscriptionResultDto {
  subscription: ShopSubscription;
  plan: Plan | null;
  entitlements: Entitlements;
}
