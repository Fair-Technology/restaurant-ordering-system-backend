import { ShopOptionGroup } from '../../../domain/optionGroup/ShopOptionGroup';
import { optionGroupContainer } from '../cosmosClient';

export async function findShopOptionGroupById(
  groupId: string,
  shopId: string,
): Promise<ShopOptionGroup | null> {
  try {
    const { resource } = await optionGroupContainer
      .item(groupId, shopId)
      .read<ShopOptionGroup>();
    return resource || null;
  } catch (error: any) {
    if (error.code === 404) {
      return null;
    }
    throw error;
  }
}

export async function findShopOptionGroupsByShopId(shopId: string): Promise<ShopOptionGroup[]> {
  const querySpec = {
    query: 'SELECT * FROM c WHERE c.shopId = @shopId AND c.isDeleted = false',
    parameters: [{ name: '@shopId', value: shopId }],
  };

  const { resources } = await optionGroupContainer.items
    .query<ShopOptionGroup>(querySpec, { partitionKey: shopId })
    .fetchAll();
  return resources || [];
}

export async function createShopOptionGroup(group: ShopOptionGroup): Promise<ShopOptionGroup> {
  const { resource } = await optionGroupContainer.items.create<ShopOptionGroup>(group);
  return resource!;
}

export async function updateShopOptionGroup(group: ShopOptionGroup): Promise<ShopOptionGroup> {
  const { resource } = await optionGroupContainer
    .item(group.id, group.shopId)
    .replace<ShopOptionGroup>(group);
  return resource!;
}

export async function deleteShopOptionGroup(groupId: string, shopId: string): Promise<void> {
  await optionGroupContainer.item(groupId, shopId).delete();
}
