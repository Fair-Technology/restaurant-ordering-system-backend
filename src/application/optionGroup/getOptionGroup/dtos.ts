import { ShopOptionGroupDto } from '../optionGroupShared';

export interface GetOptionGroupRequestDto {
  shopId: string;
  groupId: string;
}

export type GetOptionGroupResultDto = ShopOptionGroupDto;
