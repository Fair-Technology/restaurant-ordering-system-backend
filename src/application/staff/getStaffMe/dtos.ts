import { MenuLanguage } from '../../../domain/reference/ReferenceLists';
import { StaffAccountDto } from '../_shared';
export type GetStaffMeResultDto = StaffAccountDto & {
  shopId: string;
  /** The shop's language (from its country); the first-sign-in fallback for the interface language. */
  shopLanguage: MenuLanguage;
};
