import { CoverLibraryImage } from '../../../domain/images/coverImageLibrary';
import { systemConfigContainer } from '../cosmosClient';

const LIBRARY_DOC_ID = 'cover_image_library';

interface CoverImageLibraryDoc {
  id: 'cover_image_library';
  images: CoverLibraryImage[];
  updatedAt: string;
}

export async function getCoverImageLibrary(): Promise<CoverLibraryImage[]> {
  try {
    const { resource } = await systemConfigContainer
      .item(LIBRARY_DOC_ID, LIBRARY_DOC_ID)
      .read<CoverImageLibraryDoc>();
    return resource?.images ?? [];
  } catch (error: any) {
    if (error.code === 404) return [];
    throw error;
  }
}

/** The library ordered for display (ascending `order`); shared by the platform and shop lists. */
export async function getSortedCoverImageLibrary(): Promise<CoverLibraryImage[]> {
  const images = await getCoverImageLibrary();
  return [...images].sort((a, b) => a.order - b.order);
}

export async function saveCoverImageLibrary(images: CoverLibraryImage[]): Promise<void> {
  await systemConfigContainer.items.upsert<CoverImageLibraryDoc>({
    id: LIBRARY_DOC_ID,
    images,
    updatedAt: new Date().toISOString(),
  });
}
