import { HttpRequest } from '@azure/functions';
import { verifyEntraAccessToken } from './authHelpers';

// The staff variant (`{ kind: 'staff'; staffId: string; shopId: string; role: StaffRole }`)
// is added in step 25, once StaffAccount/StaffRole exist.
export type Principal = { kind: 'entra'; userId: string; email?: string; name?: string };

export async function authenticate(request: HttpRequest): Promise<Principal> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Authentication required');
  }

  const token = authHeader.slice(7);
  const { oid, email, name } = await verifyEntraAccessToken(token);
  return { kind: 'entra', userId: oid, email, name };
}
