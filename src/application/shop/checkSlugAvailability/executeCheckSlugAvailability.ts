import { isSlugReservedByAnother } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import { validateSlugFormat } from '../createShop/slugHelpers';
import { ApplicationResult } from '../../_shared/types';
import { logServiceFailure } from '../../_shared/logServiceFailure';

export async function executeCheckSlugAvailability(request: {
  slug: string;
}): Promise<ApplicationResult<{ slug: string; available: boolean }>> {
  const formatError = validateSlugFormat(request.slug);
  if (formatError) {
    return { ok: false, code: 'INVALID_INPUT', error: formatError };
  }

  try {
    const reserved = await isSlugReservedByAnother(request.slug);
    return { ok: true, data: { slug: request.slug, available: !reserved } };
  } catch (error) {
    logServiceFailure('checkSlugAvailability', error);
    return {
      ok: false,
      code: 'INTERNAL_ERROR',
      error: 'Failed to check link availability',
    };
  }
}
