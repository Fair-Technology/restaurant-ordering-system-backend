import { TranslationMap } from '../../../domain/menu/menuLanguage';
import { ShopOptionGroupDto, ShopOptionGroupOptionInputDto } from '../optionGroupShared';

/** Full replace of the editable fields. kind is immutable and ignored if sent. */
export interface UpdateOptionGroupRequestDto {
  shopId: string;
  groupId: string;
  name: string;
  nameTranslations?: TranslationMap;
  /** Addon groups only (variant groups are always 1/1). Defaults to 0. */
  minSelectable?: number;
  /** Addon groups only (variant groups are always 1/1). Defaults to the number of options. */
  maxSelectable?: number;
  /** Options with an existing id keep it; options without one are new; omitted options are dropped. */
  options: ShopOptionGroupOptionInputDto[];
}

export type UpdateOptionGroupResultDto = ShopOptionGroupDto;
