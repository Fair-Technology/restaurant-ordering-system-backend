// Builds the Cosmos (read) and blob (write) clients the archive job uses, from app settings.
// Locally a key / connection string is used (emulator, Azurite); deployed, with no key set, the
// Function App's user-assigned identity is used (Cosmos Built-in Data Reader + Storage Blob Data Owner,
// granted in infra/main.bicep). Errors name the missing setting, never a value.
import { CosmosClient } from '@azure/cosmos';
import { DefaultAzureCredential } from '@azure/identity';
import { BlobServiceClient, StorageSharedKeyCredential } from '@azure/storage-blob';
import { type BlobContainer, containerClientToBlobContainer } from './archiveBlob';

function setting(...names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n];
    if (v) return v;
  }
  return undefined;
}

/**
 * The Function App has only a user-assigned identity, so the managed-identity credential must be told
 * which one. AZURE_CLIENT_ID is read by DefaultAzureCredential itself; otherwise fall back to the client
 * id the host already uses for its own storage (AzureWebJobsStorage__clientId, set by main.bicep).
 */
function identityCredential(): DefaultAzureCredential {
  const clientId = setting('AZURE_CLIENT_ID', 'AzureWebJobsStorage__clientId');
  return clientId ? new DefaultAzureCredential({ managedIdentityClientId: clientId }) : new DefaultAzureCredential();
}

export function createArchiveCosmosClient(): { client: CosmosClient; endpoint: string; databaseId: string } {
  const endpoint = setting('COSMOS_DB_ENDPOINT', 'COSMOS_ENDPOINT');
  const databaseId = setting('COSMOS_DB_DATABASE_ID', 'COSMOS_DB_ID');
  if (!endpoint) throw new Error('Archive: COSMOS_DB_ENDPOINT (or COSMOS_ENDPOINT) is not set');
  if (!databaseId) throw new Error('Archive: COSMOS_DB_DATABASE_ID (or COSMOS_DB_ID) is not set');
  const key = setting('COSMOS_DB_KEY', 'COSMOS_KEY');
  const client = key
    ? new CosmosClient({ endpoint, key })
    : new CosmosClient({ endpoint, aadCredentials: identityCredential() });
  return { client, endpoint, databaseId };
}

export function resolveArchiveBlobContainer(): { container: BlobContainer; account: string; containerName: string } {
  const containerName = setting('ARCHIVE_BLOB_CONTAINER') ?? 'records-archive';
  const connectionString = setting('AZURE_STORAGE_CONNECTION_STRING');
  if (connectionString) {
    const service = BlobServiceClient.fromConnectionString(connectionString);
    return {
      container: containerClientToBlobContainer(service.getContainerClient(containerName)),
      account: service.accountName,
      containerName,
    };
  }
  const account = setting('ARCHIVE_STORAGE_ACCOUNT', 'STORAGE_ACCOUNT_NAME');
  if (!account) {
    throw new Error('Archive: set AZURE_STORAGE_CONNECTION_STRING, or ARCHIVE_STORAGE_ACCOUNT (or STORAGE_ACCOUNT_NAME)');
  }
  const url = `https://${account}.blob.core.windows.net`;
  const key = setting('ARCHIVE_STORAGE_KEY', 'STORAGE_ACCOUNT_KEY');
  const service = key
    ? new BlobServiceClient(url, new StorageSharedKeyCredential(account, key))
    : new BlobServiceClient(url, identityCredential());
  return { container: containerClientToBlobContainer(service.getContainerClient(containerName)), account, containerName };
}
