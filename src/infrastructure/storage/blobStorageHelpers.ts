import {
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  SASProtocol,
  BlobServiceClient,
} from '@azure/storage-blob';

// Environment variables for Azure Storage
const STORAGE_ACCOUNT_NAME = process.env.STORAGE_ACCOUNT_NAME;
const STORAGE_ACCOUNT_KEY = process.env.STORAGE_ACCOUNT_KEY;
const CONTAINER_NAME = 'product-media';

if (!STORAGE_ACCOUNT_NAME || !STORAGE_ACCOUNT_KEY) {
  throw new Error('STORAGE_ACCOUNT_NAME and STORAGE_ACCOUNT_KEY environment variables are required');
}

// Create shared key credential for SAS generation
const sharedKeyCredential = new StorageSharedKeyCredential(
  STORAGE_ACCOUNT_NAME,
  STORAGE_ACCOUNT_KEY
);

/**
 * Map content type to file extension
 */
export function getFileExtensionFromContentType(contentType: string): string {
  const contentTypeMap: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
  };

  const extension = contentTypeMap[contentType.toLowerCase()];
  if (!extension) {
    throw new Error(`Unsupported content type: ${contentType}`);
  }

  return extension;
}

/**
 * Validate content type is allowed
 */
export function validateContentType(contentType: string): void {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(contentType.toLowerCase())) {
    throw new Error(`Content type ${contentType} is not allowed. Allowed types: ${allowedTypes.join(', ')}`);
  }
}

/**
 * Generate blob path in the format: shops/{shopId}/products/{productId}/{imageId}{ext}
 */
export function generateBlobPath(shopId: string, productId: string, imageId: string, extension: string): string {
  return `shops/${shopId}/products/${productId}/${imageId}${extension}`;
}

/**
 * Generate full blob URL (without SAS)
 */
export function generateBlobUrl(blobPath: string): string {
  return `https://${STORAGE_ACCOUNT_NAME}.blob.core.windows.net/${CONTAINER_NAME}/${blobPath}`;
}

/**
 * Generate SAS URL for blob upload with create-only permission
 * @param blobPath - The blob path within the container
 * @returns Object containing the SAS URL and expiry time
 */
export function generateUploadSasUrl(blobPath: string): { sasUrl: string; expiresAt: string } {
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 10); // 10 minutes from now

  // create only: a new blob, never an overwrite
  const permissions = new BlobSASPermissions();
  permissions.create = true;

  // Generate SAS query parameters
  const sasQueryParams = generateBlobSASQueryParameters(
    {
      containerName: CONTAINER_NAME,
      blobName: blobPath,
      permissions,
      expiresOn: expiresAt,
      protocol: SASProtocol.Https,
    },
    sharedKeyCredential
  );

  const sasUrl = `https://${STORAGE_ACCOUNT_NAME}.blob.core.windows.net/${CONTAINER_NAME}/${blobPath}?${sasQueryParams.toString()}`;

  return {
    sasUrl,
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * Generate blob path for shop branding: shops/{shopId}/branding/{imageId}{ext}
 */
export function generateShopBrandingBlobPath(shopId: string, imageId: string, extension: string): string {
  return `shops/${shopId}/branding/${imageId}${extension}`;
}

/**
 * Delete a blob by its path — no-op if it no longer exists
 */
export async function deleteBlob(blobPath: string): Promise<void> {
  const serviceClient = new BlobServiceClient(
    `https://${STORAGE_ACCOUNT_NAME}.blob.core.windows.net`,
    sharedKeyCredential,
  );
  await serviceClient
    .getContainerClient(CONTAINER_NAME)
    .getBlockBlobClient(blobPath)
    .deleteIfExists();
}

/**
 * Download the first `count` bytes (from `offset`) of a blob; null if the blob does not exist.
 * Used to read an image's header without downloading the whole file.
 */
export async function downloadBlobRange(blobPath: string, offset: number, count: number): Promise<Buffer | null> {
  const serviceClient = new BlobServiceClient(
    `https://${STORAGE_ACCOUNT_NAME}.blob.core.windows.net`,
    sharedKeyCredential,
  );
  const blob = serviceClient.getContainerClient(CONTAINER_NAME).getBlockBlobClient(blobPath);
  try {
    // Up to `count` bytes: a file shorter than the range gives what it has. (downloadToBuffer
    // insists on exactly `count` and throws "Stream drains before getting enough data".)
    const response = await blob.download(offset, count);
    const chunks: Buffer[] = [];
    for await (const chunk of response.readableStreamBody ?? []) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  } catch (e: unknown) {
    const code = (e as { statusCode?: number })?.statusCode;
    if (code === 404) return null;
    if (code === 416) return Buffer.alloc(0); // offset at or past the end, e.g. an empty file
    throw e;
  }
}

export interface BlobUploadProperties {
  contentLength: number;
  contentType: string | null;
}

/**
 * Stored size and declared content type of a blob; null if the blob does not exist.
 */
export async function getBlobProperties(blobPath: string): Promise<BlobUploadProperties | null> {
  const blob = new BlobServiceClient(
    `https://${STORAGE_ACCOUNT_NAME}.blob.core.windows.net`,
    sharedKeyCredential,
  )
    .getContainerClient(CONTAINER_NAME)
    .getBlockBlobClient(blobPath);
  try {
    const p = await blob.getProperties();
    return { contentLength: p.contentLength ?? 0, contentType: p.contentType ?? null };
  } catch (e: unknown) {
    if ((e as { statusCode?: number })?.statusCode === 404) return null;
    throw e;
  }
}

/**
 * Validate maxSizeBytes parameter if provided
 */
export function validateMaxSizeBytes(maxSizeBytes?: any): void {
  if (maxSizeBytes !== undefined) {
    if (typeof maxSizeBytes !== 'number' || maxSizeBytes <= 0 || !Number.isInteger(maxSizeBytes)) {
      throw new Error('maxSizeBytes must be a positive integer');
    }
  }
}
