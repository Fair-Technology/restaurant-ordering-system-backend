import { Category } from '../../../domain/category/Category';
import { categoryContainer } from '../cosmosClient';

export async function findCategoryById(
  categoryId: string,
  shopId: string,
): Promise<Category | null> {
  try {
    const { resource } = await categoryContainer
      .item(categoryId, shopId)
      .read<Category>();

    return resource || null;
  } catch (error: any) {
    if (error.code === 404) {
      return null;
    }
    throw error;
  }
}

export async function findCategoriesByShopId(
  shopId: string,
): Promise<Category[]> {
  try {
    const querySpec = {
      query:
        'SELECT * FROM c WHERE c.shopId = @shopId AND c.isDeleted = false ORDER BY c.sortOrder ASC',
      parameters: [{ name: '@shopId', value: shopId }],
    };

    const { resources } = await categoryContainer.items
      .query<Category>(querySpec)
      .fetchAll();
    return resources || [];
  } catch (error) {
    throw error;
  }
}

export async function createCategory(category: Category): Promise<Category> {
  try {
    const { resource } =
      await categoryContainer.items.create<Category>(category);
    return resource!;
  } catch (error) {
    throw error;
  }
}

export async function updateCategory(category: Category): Promise<Category> {
  try {
    const { resource } = await categoryContainer
      .item(category.id, category.shopId)
      .replace<Category>(category);
    return resource!;
  } catch (error) {
    throw error;
  }
}

export async function deleteCategory(
  categoryId: string,
  shopId: string,
): Promise<void> {
  try {
    await categoryContainer.item(categoryId, shopId).delete();
  } catch (error) {
    throw error;
  }
}

/** Ids of every category of a shop, soft-deleted ones included (the wind-down removes them all). */
export async function findAllCategoryIdsByShopId(shopId: string): Promise<string[]> {
  const { resources } = await categoryContainer.items
    .query<{ id: string }>(
      { query: 'SELECT c.id FROM c WHERE c.shopId = @shopId', parameters: [{ name: '@shopId', value: shopId }] },
      { partitionKey: shopId },
    )
    .fetchAll();
  return (resources || []).map((r) => r.id);
}
