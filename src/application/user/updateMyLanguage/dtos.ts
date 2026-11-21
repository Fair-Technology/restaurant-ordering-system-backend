import { GetMeResultDto } from '../getMe/dtos';
import { MenuLanguage } from '../../../domain/reference/ReferenceLists';
export interface UpdateMyLanguageRequestDto {
  language: MenuLanguage;
}
export type UpdateMyLanguageResultDto = GetMeResultDto;
