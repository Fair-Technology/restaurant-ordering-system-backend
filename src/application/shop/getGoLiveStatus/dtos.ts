export interface GetGoLiveStatusRequestDto {
  shopId: string;
}

export interface GoLiveCriterion {
  key: string;
  met: boolean;
  description: string;
}

export interface GetGoLiveStatusResultDto {
  allMet: boolean;
  criteria: GoLiveCriterion[];
  hasAnyProducts: boolean; // true if the shop has at least one non-deleted product (dish or combo), regardless of availability/allergen declaration
}
