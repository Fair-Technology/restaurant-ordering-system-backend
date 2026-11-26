import { CoverLibraryImage } from '../../../domain/images/coverImageLibrary';

export interface RenameCoverLibraryImageRequestDto {
  imageId: string;
  name: string;
}

export type RenameCoverLibraryImageResultDto = CoverLibraryImage;
