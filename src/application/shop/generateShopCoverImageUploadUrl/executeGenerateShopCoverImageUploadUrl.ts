import { HttpRequest } from '@azure/functions';
import { ApplicationResult } from '../../_shared/types';
import { GenerateShopLogoUploadUrlRequestDto, GenerateShopLogoUploadUrlResultDto } from '../generateShopLogoUploadUrl/dtos';
import { executeGenerateShopLogoUploadUrl } from '../generateShopLogoUploadUrl/executeGenerateShopLogoUploadUrl';

export type GenerateShopCoverImageUploadUrlRequestDto = GenerateShopLogoUploadUrlRequestDto;
export type GenerateShopCoverImageUploadUrlResultDto = GenerateShopLogoUploadUrlResultDto;

// Cover and logo share the branding folder and the same type check; delegate, don't copy.
export function executeGenerateShopCoverImageUploadUrl(
  request: GenerateShopCoverImageUploadUrlRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<GenerateShopCoverImageUploadUrlResultDto>> {
  return executeGenerateShopLogoUploadUrl(request, httpRequest);
}
