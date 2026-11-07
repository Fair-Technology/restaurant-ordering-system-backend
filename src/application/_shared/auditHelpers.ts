import { HttpRequest } from '@azure/functions';
import { AuditChange, AuditInput } from '../../domain/audit/AuditEntry';
import { buildAuditEntry } from './buildAuditEntry';
import { createAuditEntry } from '../../infrastructure/cosmos/audit/CosmosAuditRepository';
import { upsertUser } from '../../infrastructure/cosmos/user/CosmosUserRepository';
import { verifyEntraToken } from '../../infrastructure/auth/trustedIssuers';

export async function getActorFromAuth(
  request: HttpRequest,
): Promise<{ userId: string; email?: string; name?: string }> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Authentication required');
  }

  const token = authHeader.slice(7);
  const { oid, email, name, issuer } = await verifyEntraToken(token);

  // Only customer-store identities get a users document. Platform operators are
  // our own staff: they have no profile in the users container, and creating one
  // would put them in shop-facing user data.
  if (issuer === 'customer') {
    // Fire-and-forget: ensure a user profile exists; never downgrades an existing superadmin
    const now = new Date().toISOString();
    upsertUser({ id: oid, email, name, systemRole: 'user', createdAt: now, updatedAt: now }).catch(
      (err) => {
        console.error('[auditHelpers] Failed to upsert user profile:', err?.message);
      },
    );
  }

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
