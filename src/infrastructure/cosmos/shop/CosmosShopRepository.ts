import type { PatchOperation } from '@azure/cosmos';
import { Shop } from '../../../domain/shop/Shop';
import { shopContainer } from '../cosmosClient';

export async function findShopById(shopId: string): Promise<Shop | null> {
  try {
    const { resource } = await shopContainer.item(shopId, shopId).read<Shop>();
    return resource || null;
  } catch (error: any) {
    if (error.code === 404) {
      return null;
    }
    throw error;
  }
}

export async function findShopBySlug(slug: string): Promise<Shop | null> {
  try {
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.slug = @slug AND c.isDeleted = false',
      parameters: [{ name: '@slug', value: slug }],
    };

    const { resources } = await shopContainer.items
      .query<Shop>(querySpec)
      .fetchAll();
    return resources && resources.length > 0 ? resources[0] : null;
  } catch (error) {
    throw error;
  }
}

export async function createShop(shop: Shop): Promise<Shop> {
  try {
    const { resource } = await shopContainer.items.create<Shop>(shop);
    return resource!;
  } catch (error) {
    throw error;
  }
}

export async function updateShop(shop: Shop): Promise<Shop> {
  try {
    const { resource } = await shopContainer
      .item(shop.id, shop.id)
      .replace<Shop>(shop);
    return resource!;
  } catch (error) {
    throw error;
  }
}

export async function findShopWithEtag(shopId: string): Promise<{ shop: Shop; etag: string } | null> {
  try {
    const { resource, etag } = await shopContainer.item(shopId, shopId).read<Shop>();
    return resource && etag ? { shop: resource, etag } : null;
  } catch (error: any) {
    if (error.code === 404) return null;
    throw error;
  }
}

/** Replaces the shop only if nobody changed it since it was read; 'conflict' means someone did. */
export async function replaceShopIfMatch(shop: Shop, etag: string): Promise<'ok' | 'conflict'> {
  try {
    await shopContainer.item(shop.id, shop.id).replace<Shop>(shop, {
      accessCondition: { type: 'IfMatch', condition: etag },
    });
    return 'ok';
  } catch (error: any) {
    if (error.code === 412) return 'conflict';
    throw error;
  }
}

export async function deleteShop(shopId: string): Promise<void> {
  try {
    await shopContainer.item(shopId, shopId).delete();
  } catch (error) {
    throw error;
  }
}

export async function findAllShops(): Promise<Shop[]> {
  try {
    const querySpec = {
      query:
        'SELECT TOP 20 * FROM c WHERE c.isDeleted = false ORDER BY c.createdAt DESC',
      parameters: [],
    };

    const { resources } = await shopContainer.items
      .query<Shop>(querySpec)
      .fetchAll();
    return resources || [];
  } catch (error) {
    throw error;
  }
}

export async function findShopsByMemberId(userId: string): Promise<Shop[]> {
  try {
    const querySpec = {
      query: `SELECT * FROM c WHERE c.isDeleted = false
              AND EXISTS(SELECT VALUE m FROM m IN c.members
                         WHERE m.userId = @userId AND m.isActive = true)`,
      parameters: [{ name: '@userId', value: userId }],
    };
    const { resources } = await shopContainer.items.query<Shop>(querySpec).fetchAll();
    return resources || [];
  } catch (error) {
    throw error;
  }
}

export async function findShopByStripeConnectAccountId(
  stripeConnectAccountId: string,
): Promise<Shop | null> {
  try {
    const querySpec = {
      query:
        'SELECT * FROM c WHERE c.stripe.connectAccountId = @accountId AND c.isDeleted = false',
      parameters: [{ name: '@accountId', value: stripeConnectAccountId }],
    };
    const { resources } = await shopContainer.items.query<Shop>(querySpec).fetchAll();
    return resources?.[0] ?? null;
  } catch (error) {
    throw error;
  }
}

export async function findOwnedShopIds(userId: string): Promise<string[]> {
  try {
    const querySpec = {
      query: `SELECT c.id FROM c
              WHERE c.isDeleted = false
              AND EXISTS(SELECT VALUE m FROM m IN c.members
                         WHERE m.userId = @userId AND m.role = 'owner' AND m.isActive = true)`,
      parameters: [{ name: '@userId', value: userId }],
    };
    const { resources } = await shopContainer.items
      .query<{ id: string }>(querySpec)
      .fetchAll();
    return (resources || []).map((r) => r.id);
  } catch (error) {
    throw error;
  }
}

/** Sets top-level fields without rewriting the rest of the shop, so two people saving different things don't undo each other. */
export async function patchShopFields(
  shopId: string,
  fields: Partial<Pick<Shop, 'busyMode' | 'updatedAt'>>,
): Promise<void> {
  const ops: PatchOperation[] = Object.entries(fields).map(([key, value]) => ({
    op: 'set',
    path: `/${key}`,
    value,
  }));
  await shopContainer.item(shopId, shopId).patch(ops);
}

/** Sets one nested value (e.g. '/stripe/connectOnboardingStatus') without rewriting the rest of the shop. */
export async function patchShopPath(shopId: string, path: string, value: unknown): Promise<void> {
  await shopContainer.item(shopId, shopId).patch([
    { op: 'set', path, value },
    { op: 'set', path: '/updatedAt', value: new Date().toISOString() },
  ]);
}
