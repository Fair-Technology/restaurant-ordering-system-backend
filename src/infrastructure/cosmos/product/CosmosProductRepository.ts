import { Product } from '../../../domain/product/Product';
import { productContainer } from '../cosmosClient';

export async function findProductById(
  productId: string,
  shopId: string,
): Promise<Product | null> {
  try {
    const { resource } = await productContainer
      .item(productId, shopId)
      .read<Product>();
    return resource || null;
  } catch (error: any) {
    if (error.code === 404) {
      return null;
    }
    throw error;
  }
}

export async function findProductsByShopId(shopId: string): Promise<Product[]> {
  try {
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.shopId = @shopId AND c.isDeleted = false',
      parameters: [{ name: '@shopId', value: shopId }],
    };

    const { resources } = await productContainer.items
      .query<Product>(querySpec)
      .fetchAll();
    return resources || [];
  } catch (error) {
    throw error;
  }
}

export async function createProduct(product: Product): Promise<Product> {
  try {
    const { resource } = await productContainer.items.create<Product>(product);
    return resource!;
  } catch (error) {
    throw error;
  }
}

export async function updateProduct(product: Product): Promise<Product> {
  try {
    const { resource } = await productContainer
      .item(product.id, product.shopId)
      .replace<Product>(product);
    return resource!;
  } catch (error) {
    throw error;
  }
}

export async function deleteProduct(
  productId: string,
  shopId: string,
): Promise<void> {
  try {
    await productContainer.item(productId, shopId).delete();
  } catch (error) {
    throw error;
  }
}

/** Ids of every product of a shop, soft-deleted ones included (the wind-down removes them all). */
export async function findAllProductIdsByShopId(shopId: string): Promise<string[]> {
  const { resources } = await productContainer.items
    .query<{ id: string }>(
      { query: 'SELECT c.id FROM c WHERE c.shopId = @shopId', parameters: [{ name: '@shopId', value: shopId }] },
      { partitionKey: shopId },
    )
    .fetchAll();
  return (resources || []).map((r) => r.id);
}
