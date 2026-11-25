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

/**
 * Callers pass a partial view of the user (e.g. getMe only knows id/email/name),
 * so a naive replace would drop fields set elsewhere such as `maxShops` and
 * `language`. Merge over the existing document instead; an explicitly-undefined
 * field in `incoming` never erases a real stored value. createdAt stays pinned
 * to the signup date.
 */
export async function upsertUser(incoming: UserProfile): Promise<UserProfile> {
  const existing = await findUserById(incoming.id);

  const merged: Record<string, unknown> = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (value !== undefined) merged[key] = value;
  }

  const profile = {
    ...(merged as unknown as UserProfile),
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

/** Paged user list, optionally filtered by a case-insensitive substring of email or name. */
export async function findUsers(
  search: string | undefined,
  page: number,
  pageSize: number,
): Promise<{ users: UserProfile[]; total: number }> {
  const offset = (page - 1) * pageSize;
  const term = search?.trim().toLowerCase();
  const where = term
    ? ' WHERE CONTAINS(LOWER(c.email), @search) OR CONTAINS(LOWER(c.name), @search)'
    : '';
  const filterParams = term ? [{ name: '@search', value: term }] : [];

  const { resources: countResult } = await usersContainer.items
    .query<number>({ query: `SELECT VALUE COUNT(1) FROM c${where}`, parameters: filterParams })
    .fetchAll();
  const total = countResult[0] ?? 0;

  const { resources: users } = await usersContainer.items
    .query<UserProfile>({
      query: `SELECT * FROM c${where} ORDER BY c.email ASC, c.id ASC OFFSET @offset LIMIT @pageSize`,
      parameters: [
        ...filterParams,
        { name: '@offset', value: offset },
        { name: '@pageSize', value: pageSize },
      ],
    })
    .fetchAll();

  return { users: users ?? [], total };
}
