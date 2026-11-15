import { ShopOptionGroupDto } from '../optionGroupShared';

export interface GetOptionGroupsRequestDto {
  shopId: string;
}

export type GetOptionGroupsResultDto = ShopOptionGroupDto[];
