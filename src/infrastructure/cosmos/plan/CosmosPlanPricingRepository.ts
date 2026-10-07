import { PlanPricing } from '../../../domain/plan/PlanPricing';
import { planPricingContainer } from '../cosmosClient';

export async function findPricingByPlan(planId: string): Promise<PlanPricing[]> {
  try {
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.planId = @planId',
      parameters: [{ name: '@planId', value: planId }],
    };
    const { resources } = await planPricingContainer.items.query<PlanPricing>(querySpec).fetchAll();
    return resources || [];
  } catch (error) {
    throw error;
  }
}

export async function findPricingByPlanAndCurrency(planId: string, currency: string): Promise<PlanPricing | null> {
  try {
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.planId = @planId AND c.currency = @currency',
      parameters: [
        { name: '@planId', value: planId },
        { name: '@currency', value: currency },
      ],
    };
    const { resources } = await planPricingContainer.items.query<PlanPricing>(querySpec).fetchAll();
    return resources && resources.length > 0 ? resources[0] : null;
  } catch (error) {
    throw error;
  }
}

export async function upsertPricing(pricing: PlanPricing): Promise<PlanPricing> {
  try {
    const { resource } = await planPricingContainer.items.upsert<PlanPricing>(pricing);
    return resource!;
  } catch (error) {
    throw error;
  }
}

/** The pricing row that holds this Stripe price id, so a subscription's price can be mapped back to a plan. */
export async function findPricingByBillingPriceId(priceId: string): Promise<PlanPricing | null> {
  try {
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.billingPriceIdMonthly = @p OR c.billingPriceIdYearly = @p',
      parameters: [{ name: '@p', value: priceId }],
    };
    const { resources } = await planPricingContainer.items.query<PlanPricing>(querySpec).fetchAll();
    return resources && resources.length > 0 ? resources[0] : null;
  } catch (error) {
    throw error;
  }
}
