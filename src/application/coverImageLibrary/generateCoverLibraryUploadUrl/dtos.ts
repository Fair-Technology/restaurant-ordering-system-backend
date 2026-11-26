export interface GenerateCoverLibraryUploadUrlRequestDto {
  contentType: string;
}

export interface GenerateCoverLibraryUploadUrlResultDto {
  imageId: string;
  uploadUrl: string;
  blobUrl: string;
  expiresAt: string;
}
