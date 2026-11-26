import { CoverLibraryImage } from '../../../domain/images/coverImageLibrary';

export interface RegisterCoverLibraryImageRequestDto {
  imageId: string;
  url: string;
  name: string;
}

export type RegisterCoverLibraryImageResultDto = CoverLibraryImage;
