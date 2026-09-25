import { SignJWT, jwtVerify } from 'jose';
import { StaffRole } from '../../domain/staff/StaffAccount';

export const STAFF_TOKEN_ISSUER = 'restaurant-ordering-system/staff';
export const STAFF_TOKEN_AUDIENCE = 'restaurant-ordering-system/api';
export const STAFF_TOKEN_TTL_SECONDS = 43200; // 12h

export interface StaffTokenClaims {
  staffId: string;
  shopId: string;
  role: StaffRole;
}

function secret(): Uint8Array {
  const s = process.env.STAFF_JWT_SECRET;
  if (!s || s.length < 32) {
    throw new Error('STAFF_JWT_SECRET is not configured');
  }
  return new TextEncoder().encode(s);
}

export async function signStaffToken(
  claims: StaffTokenClaims,
  now: Date,
): Promise<{ token: string; expiresAt: string }> {
  const iat = Math.floor(now.getTime() / 1000);
  const exp = iat + STAFF_TOKEN_TTL_SECONDS;

  const token = await new SignJWT({ typ: 'staff', shopId: claims.shopId, role: claims.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.staffId)
    .setIssuer(STAFF_TOKEN_ISSUER)
    .setAudience(STAFF_TOKEN_AUDIENCE)
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(secret());

  return { token, expiresAt: new Date(exp * 1000).toISOString() };
}

export async function verifyStaffToken(token: string): Promise<StaffTokenClaims> {
  const key = secret(); // a config error propagates as-is (500, not a credentials leak)

  try {
    const { payload } = await jwtVerify(token, key, {
      issuer: STAFF_TOKEN_ISSUER,
      audience: STAFF_TOKEN_AUDIENCE,
      algorithms: ['HS256'],
    });

    if (
      payload.typ !== 'staff' ||
      typeof payload.sub !== 'string' ||
      typeof payload.shopId !== 'string' ||
      (payload.role !== 'manager' && payload.role !== 'staff')
    ) {
      throw new Error();
    }

    return { staffId: payload.sub, shopId: payload.shopId as string, role: payload.role };
  } catch {
    throw new Error('Authentication required');
  }
}
