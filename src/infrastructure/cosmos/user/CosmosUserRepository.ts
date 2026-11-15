import { UserProfile } from '../../../domain/user/UserProfile';
import { usersContainer } from '../cosmosClient';

export async function findUserById(userId: string): Promise<UserProfile | null> {
  try {
    const { resource } = await usersContainer.item(userId, userId).read<UserProfile>();
    return resource ?? null;
  } catch (err: any) {
    if (err.code === 404) return null;
    throw err;
  }
}

export async function upsertUser(incoming: UserProfile): Promise<UserProfile> {
  const existing = await findUserById(incoming.id);

  // Preserve createdAt so lazy upserts never reset a user's signup date
  const profile: UserProfile = {
    ...incoming,
    createdAt: existing?.createdAt ?? incoming.createdAt,
    updatedAt: incoming.updatedAt,
  };

  await usersContainer.items.upsert<UserProfile>(profile);
  return profile;
}

export async function patchUserLimits(
  userId: string,
  maxShops: number | null,
): Promise<UserProfile | null> {
  const existing = await findUserById(userId);
  if (!existing) return null;

  const updated: UserProfile = {
    ...existing,
    maxShops,
    updatedAt: new Date().toISOString(),
  };

  await usersContainer.items.upsert<UserProfile>(updated);
  return updated;
}
