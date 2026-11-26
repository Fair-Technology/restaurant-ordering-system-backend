import { SystemConfig } from '../../../domain/system/SystemConfig';
import { systemConfigContainer } from '../cosmosClient';

const GLOBAL_CONFIG_ID = 'global';

export async function getSystemConfig(): Promise<SystemConfig> {
  try {
    const { resource } = await systemConfigContainer
      .item(GLOBAL_CONFIG_ID, GLOBAL_CONFIG_ID)
      .read<SystemConfig>();
    if (resource) return { ...resource, emailEnabled: resource.emailEnabled === true };
    return { id: 'global', maxShopsDefault: 3, emailEnabled: false, updatedAt: new Date().toISOString() };
  } catch (error: any) {
    if (error.code === 404) {
      return { id: 'global', maxShopsDefault: 3, emailEnabled: false, updatedAt: new Date().toISOString() };
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
