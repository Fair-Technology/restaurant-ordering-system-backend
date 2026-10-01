import { PlatformLegalIdentity } from '../../domain/legal/PlatformLegalIdentity';
import { PlatformLegalIdentityDto } from './dtos';

export function toPlatformLegalIdentityDto(doc: PlatformLegalIdentity): PlatformLegalIdentityDto {
  const { id: _id, ...rest } = doc;
  return rest;
}
