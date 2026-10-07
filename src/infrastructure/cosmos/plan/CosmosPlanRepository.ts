import { Plan } from '../../../domain/plan/Plan';
import { planContainer } from '../cosmosClient';

export async function findPlanById(id: string): Promise<Plan | null> {
  try {
    const { resource } = await planContainer.item(id, id).read<Plan>();
    return resource || null;
  } catch (error: any) {
    if (error.code === 404) return null;
    throw error;
  }
}

export async function findDefaultPlan(): Promise<Plan | null> {
  const querySpec = {
    query: 'SELECT * FROM c WHERE c.isDefault = true ORDER BY c.sortOrder ASC',
    parameters: [],
  };
  const { resources } = await planContainer.items.query<Plan>(querySpec).fetchAll();
  return resources?.[0] ?? null;
}

export async function findAllPlans(): Promise<Plan[]> {
  try {
    const querySpec = {
      query: 'SELECT * FROM c ORDER BY c.sortOrder ASC',
      parameters: [],
    };
    const { resources } = await planContainer.items.query<Plan>(querySpec).fetchAll();
    return resources || [];
  } catch (error) {
    throw error;
  }
}

export async function findVisiblePlans(): Promise<Plan[]> {
  try {
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.isVisible = true ORDER BY c.sortOrder ASC',
      parameters: [],
    };
    const { resources } = await planContainer.items.query<Plan>(querySpec).fetchAll();
    return resources || [];
  } catch (error) {
    throw error;
  }
}

export async function createPlan(plan: Plan): Promise<Plan> {
  try {
    const { resource } = await planContainer.items.create<Plan>(plan);
    return resource!;
  } catch (error) {
    throw error;
  }
}

export async function updatePlan(plan: Plan): Promise<Plan> {
  try {
    const { resource } = await planContainer.item(plan.id, plan.id).replace<Plan>(plan);
    return resource!;
  } catch (error) {
    throw error;
  }
}
