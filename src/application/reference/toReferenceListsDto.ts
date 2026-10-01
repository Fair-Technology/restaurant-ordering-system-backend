import { DIETARY_TAGS, SPICE_LEVELS } from '../../domain/product/dietary';
import { currentTaxRates, ratesUniformAcrossModes, ReferenceListsDoc } from '../../domain/reference/ReferenceLists';
import { ReferenceListsResultDto } from './dtos';

export function toReferenceListsDto(doc: ReferenceListsDoc, now: Date): ReferenceListsResultDto {
  const current = currentTaxRates(doc, now);
  return {
    countryCode: doc.countryCode,
    allergens: doc.allergens,
    additives: doc.additives,
    taxClasses: doc.taxClasses,
    defaultTaxClassId: doc.defaultTaxClassId,
    taxRates: doc.taxRates,
    currentTaxRates: current,
    taxRatesUniformAcrossModes: ratesUniformAcrossModes(current),
    dietaryTags: DIETARY_TAGS,
    spiceLevels: SPICE_LEVELS,
    updatedAt: doc.updatedAt,
  };
}
