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

  // Merge over the existing document so fields the caller doesn't send (e.g. an
  // operator-set maxShops) survive; createdAt stays pinned to the signup date.
  const profile: UserProfile = {
    ...existing,
    ...incoming,
    createdAt: existing?.createdAt ?? incoming.createdAt,
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
