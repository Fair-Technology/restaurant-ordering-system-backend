import { ShopOptionGroupDto } from '../optionGroupShared';

export interface SetOptionAvailabilityRequestDto {
  shopId: string;
  groupId: string;
  optionId: string;
  isAvailable: boolean;
}

export type SetOptionAvailabilityResultDto = ShopOptionGroupDto;
