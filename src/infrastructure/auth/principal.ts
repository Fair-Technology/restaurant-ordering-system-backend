import { HttpRequest } from '@azure/functions';
import { decodeProtectedHeader } from 'jose';
import { verifyEntraAccessToken } from './authHelpers';
import { verifyStaffToken } from './staffTokens';
import { StaffRole } from '../../domain/staff/StaffAccount';

export type Principal =
  | { kind: 'entra'; userId: string; email?: string; name?: string }
  | { kind: 'staff'; staffId: string; shopId: string; role: StaffRole };

export async function authenticate(request: HttpRequest): Promise<Principal> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Authentication required');
  }

  const token = authHeader.slice(7);

  // Staff tokens are HS256 (a shared secret); Entra tokens are RS256 (JWKS).
  // The algorithm in the unverified header is enough to route to the right
  // verifier — each verifier still independently checks signature, issuer,
  // audience and expiry before trusting anything in the payload.
  let alg: string | undefined;
  try {
    alg = decodeProtectedHeader(token).alg;
  } catch {
    throw new Error('Authentication required');
  }

  if (alg === 'HS256') {
    const claims = await verifyStaffToken(token);
    return { kind: 'staff', staffId: claims.staffId, shopId: claims.shopId, role: claims.role };
  }

  const { oid, email, name } = await verifyEntraAccessToken(token);
  return { kind: 'entra', userId: oid, email, name };
}
