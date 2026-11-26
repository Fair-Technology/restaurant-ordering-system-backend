import { SystemConfig } from '../../../domain/system/SystemConfig';
import {
  DEFAULT_SCHEDULE_HORIZON_DAYS,
  MAX_SCHEDULE_HORIZON_DAYS,
  MIN_SCHEDULE_HORIZON_DAYS,
} from '../../../domain/order/scheduling';
import { systemConfigContainer } from '../cosmosClient';

const GLOBAL_CONFIG_ID = 'global';

export async function getSystemConfig(): Promise<SystemConfig> {
  try {
    const { resource } = await systemConfigContainer
      .item(GLOBAL_CONFIG_ID, GLOBAL_CONFIG_ID)
      .read<SystemConfig>();
    if (resource) {
      const days = resource.scheduleHorizonDays;
      const validDays =
        typeof days === 'number' &&
        Number.isInteger(days) &&
        days >= MIN_SCHEDULE_HORIZON_DAYS &&
        days <= MAX_SCHEDULE_HORIZON_DAYS;
      return {
        ...resource,
        emailEnabled: resource.emailEnabled === true,
        scheduleHorizonDays: validDays ? days : DEFAULT_SCHEDULE_HORIZON_DAYS,
      };
    }
    return { id: 'global', maxShopsDefault: 3, emailEnabled: false, scheduleHorizonDays: DEFAULT_SCHEDULE_HORIZON_DAYS, updatedAt: new Date().toISOString() };
  } catch (error: any) {
    if (error.code === 404) {
      return { id: 'global', maxShopsDefault: 3, emailEnabled: false, scheduleHorizonDays: DEFAULT_SCHEDULE_HORIZON_DAYS, updatedAt: new Date().toISOString() };
    }
    throw error;
  }
}

export async function upsertSystemConfig(patch: Partial<Omit<SystemConfig, 'id'>>): Promise<SystemConfig> {
  const existing = await getSystemConfig();
  const updated: SystemConfig = {
    ...existing,
    ...patch,
    id: 'global',
    updatedAt: new Date().toISOString(),
  };
  await systemConfigContainer.items.upsert<SystemConfig>(updated);
  return updated;
}
