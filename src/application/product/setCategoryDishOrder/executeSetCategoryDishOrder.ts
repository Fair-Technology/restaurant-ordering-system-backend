import { HttpRequest } from '@azure/functions';
import { ApplicationResult } from '../../_shared/types';
import { executeSetCategoryOrder } from '../categoryOrder/executeSetCategoryOrder';
import { SetCategoryDishOrderRequestDto, SetCategoryDishOrderResultDto } from './dtos';

// Dishes only: combos are invisible here (neither accepted nor required). Combos have their own endpoint,
// see executeSetCategoryComboOrder; both share executeSetCategoryOrder. The signature is written out
// literally because scripts/generate-openapi.js reads the endpoint contract from it.
export async function executeSetCategoryDishOrder(
  request: SetCategoryDishOrderRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<SetCategoryDishOrderResultDto>> {
  return executeSetCategoryOrder(request, httpRequest, { kind: 'dish', auditAction: 'category.dishOrder.update' });
}
