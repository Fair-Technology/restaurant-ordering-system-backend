import { TranslationMap } from '../../../domain/menu/menuLanguage';
import { ShopOptionGroupDto, ShopOptionGroupOptionInputDto } from '../optionGroupShared';

export interface CreateOptionGroupRequestDto {
  shopId: string;
  kind: 'variant' | 'addon';
  name: string;
  nameTranslations?: TranslationMap;
  /** Addon groups only (variant groups are always 1/1). Defaults to 0. */
  minSelectable?: number;
  /** Addon groups only (variant groups are always 1/1). Defaults to the number of options. */
  maxSelectable?: number;
  options: ShopOptionGroupOptionInputDto[];
}

export type CreateOptionGroupResultDto = ShopOptionGroupDto;
