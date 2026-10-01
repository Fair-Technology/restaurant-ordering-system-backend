import { HttpRequest } from '@azure/functions';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import { AuditChange, AuditInput } from '../../domain/audit/AuditEntry';
import { buildAuditEntry } from './buildAuditEntry';
import { createAuditEntry } from '../../infrastructure/cosmos/audit/CosmosAuditRepository';
import { upsertUser } from '../../infrastructure/cosmos/user/CosmosUserRepository';

// Re-use CIAM JWKS from the existing auth flow (cached by jose)
const tenantName = process.env.ENTRA_TENANT_NAME!;
const tenantId = process.env.ENTRA_TENANT_ID!;
const apiClientId = process.env.ENTRA_CLIENT_ID!;

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks() {
  if (!jwks) {
    const jwksUrl = new URL(
      `https://${tenantName}.ciamlogin.com/${tenantId}/discovery/v2.0/keys`,
    );
    jwks = createRemoteJWKSet(jwksUrl);
  }
  return jwks;
}

export async function getActorFromAuth(
  request: HttpRequest,
): Promise<{ userId: string; email?: string; name?: string }> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Authentication required');
  }

  const token = authHeader.slice(7);
  const expectedIssuer = `https://${tenantId}.ciamlogin.com/${tenantId}/v2.0`;

  let payload: Record<string, unknown>;
  try {
    const result = await jwtVerify(token, getJwks(), {
      issuer: expectedIssuer,
      audience: apiClientId,
    });
    payload = result.payload as Record<string, unknown>;
  } catch {
    throw new Error('Authentication required');
  }

  const oid = payload['oid'] as string | undefined;
  if (!oid) throw new Error('Authentication required');

  const email = payload['preferred_username'] as string | undefined;
  const name = payload['name'] as string | undefined;

  // Fire-and-forget: ensure a user profile exists; never downgrades an existing superadmin
  const now = new Date().toISOString();
  upsertUser({ id: oid, email, name, systemRole: 'user', createdAt: now, updatedAt: now }).catch(
    (err) => {
      console.error('[auditHelpers] Failed to upsert user profile:', err?.message);
    },
  );

  return { userId: oid, email, name };
}

export function diffFields<T extends Record<string, unknown>>(
  oldObj: T,
  newObj: T,
  scalarFields: string[],
  complexFields: string[],
): AuditChange[] {
  const changes: AuditChange[] = [];

  for (const field of scalarFields) {
    const oldVal = oldObj[field];
    const newVal = newObj[field];
    if (oldVal !== newVal) {
      changes.push({ field, from: oldVal, to: newVal });
    }
  }

  for (const field of complexFields) {
    const oldVal = oldObj[field];
    const newVal = newObj[field];
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes.push({ field, from: '[updated]', to: '[updated]' });
    }
  }

  return changes;
}

export async function logAudit(input: AuditInput): Promise<void> {
  try {
    await createAuditEntry(buildAuditEntry(input, new Date(), crypto.randomUUID()));
  } catch (err: any) {
    console.error('[audit] Failed to write audit entry:', err?.message);
  }
}
