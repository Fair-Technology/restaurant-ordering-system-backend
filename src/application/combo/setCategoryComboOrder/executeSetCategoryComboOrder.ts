import { HttpRequest } from '@azure/functions';
import { ApplicationResult } from '../../_shared/types';
import { executeSetCategoryOrder } from '../../product/categoryOrder/executeSetCategoryOrder';
import { SetCategoryComboOrderRequestDto, SetCategoryComboOrderResultDto } from './dtos';

// Combos only: dishes are invisible here. Shares validation/write logic with dish-order. The signature is
// written out literally because scripts/generate-openapi.js reads the endpoint contract from it.
export async function executeSetCategoryComboOrder(
  request: SetCategoryComboOrderRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<SetCategoryComboOrderResultDto>> {
  return executeSetCategoryOrder(request, httpRequest, { kind: 'combo', auditAction: 'category.comboOrder.update' });
}
