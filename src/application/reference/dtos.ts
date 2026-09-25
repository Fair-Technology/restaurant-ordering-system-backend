import { DietaryTagId, SpiceLevel } from '../../domain/product/dietary';
import { AdditiveDef, AllergenDef, CurrentTaxRate, LocalizedLabel, TaxClassDef, TaxRateRow } from '../../domain/reference/ReferenceLists';

export interface ReferenceListsResultDto {
  countryCode: string;
  allergens: AllergenDef[];
  additives: AdditiveDef[];
  taxClasses: TaxClassDef[];
  defaultTaxClassId: string | null;
  taxRates: TaxRateRow[];
  currentTaxRates: CurrentTaxRate[];
  taxRatesUniformAcrossModes: boolean;
  dietaryTags: ReadonlyArray<{ id: DietaryTagId; labels: LocalizedLabel }>;
  spiceLevels: ReadonlyArray<{ id: SpiceLevel; labels: LocalizedLabel }>;
  updatedAt: string | null;
}
