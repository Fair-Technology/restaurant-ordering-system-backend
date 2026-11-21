import { MenuLanguage } from '../../../domain/reference/ReferenceLists';
import { GetStaffMeResultDto } from '../getStaffMe/dtos';
export interface UpdateMyStaffLanguageRequestDto {
  language: MenuLanguage;
}
export type UpdateMyStaffLanguageResultDto = Omit<GetStaffMeResultDto, 'shopLanguage'>;
