import { StaffAccount } from '../../../domain/staff/StaffAccount';
import { staffAccountsContainer } from '../cosmosClient';

export async function findStaffAccountById(
  shopId: string,
  staffId: string,
): Promise<StaffAccount | null> {
  try {
    const { resource } = await staffAccountsContainer
      .item(staffId, shopId)
      .read<StaffAccount>();

    return resource || null;
  } catch (error: any) {
    if (error.code === 404) {
      return null;
    }
    throw error;
  }
}

export async function findStaffAccountByUsername(
  shopId: string,
  username: string,
): Promise<StaffAccount | null> {
  const querySpec = {
    query: 'SELECT * FROM c WHERE c.shopId = @shopId AND c.username = @username',
    parameters: [
      { name: '@shopId', value: shopId },
      { name: '@username', value: username },
    ],
  };

  const { resources } = await staffAccountsContainer.items
    .query<StaffAccount>(querySpec, { partitionKey: shopId })
    .fetchAll();

  return resources[0] || null;
}

export async function listStaffAccounts(shopId: string): Promise<StaffAccount[]> {
  const querySpec = {
    query:
      'SELECT * FROM c WHERE c.shopId = @shopId AND c.isDeleted = false ORDER BY c.createdAt ASC',
    parameters: [{ name: '@shopId', value: shopId }],
  };

  const { resources } = await staffAccountsContainer.items
    .query<StaffAccount>(querySpec, { partitionKey: shopId })
    .fetchAll();

  return resources || [];
}

export async function createStaffAccount(account: StaffAccount): Promise<StaffAccount> {
  // A 409 (unique key violation on /username within the shop partition) is
  // rethrown as-is so callers can map it to a CONFLICT application error.
  const { resource } = await staffAccountsContainer.items.create<StaffAccount>(account);
  return resource!;
}

export async function replaceStaffAccount(account: StaffAccount): Promise<StaffAccount> {
  const { resource } = await staffAccountsContainer
    .item(account.id, account.shopId)
    .replace<StaffAccount>(account);
  return resource!;
}
