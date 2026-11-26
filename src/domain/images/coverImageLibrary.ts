export interface CoverLibraryImage {
  id: string;
  name: string;
  imageUrl: string;
  cardImageUrl: string;
  createdAt: string;
  order: number;
}

export const MAX_COVER_LIBRARY_IMAGES = 50;
export const COVER_IMAGE_LIBRARY_FULL_ERROR = 'Cover image library is full (max 50 images)';
