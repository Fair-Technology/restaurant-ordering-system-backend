import { findShopBySlug } from '../../../infrastructure/cosmos/shop/CosmosShopRepository';
import {
  findStaffAccountByUsername,
  listStaffAccounts,
  replaceStaffAccount,
} from '../../../infrastructure/cosmos/staff/CosmosStaffAccountRepository';
import { verifyPassword, dummyPasswordHash } from '../../../infrastructure/auth/passwordHashing';
import { signStaffToken } from '../../../infrastructure/auth/staffTokens';
import { MAX_FAILED_LOGINS, LOCKOUT_MINUTES } from '../../../domain/staff/StaffAccount';
import { SEAT_SUSPENDED_ERROR, seatHolderIds } from '../../../domain/staff/staffSeats';
import { limitOf } from '../../../domain/subscription/entitlements';
import { loadEntitlements } from '../../_shared/entitlements';
import { PLAN_LIMIT_KEYS } from '../../_shared/planLimitKeys';
import { StaffLoginRequestDto, StaffLoginResultDto } from './dtos';
import { ApplicationResult } from '../../_shared/types';

const INVALID_CREDENTIALS = { ok: false, code: 'FORBIDDEN', error: 'INVALID_CREDENTIALS' } as const;

export async function executeStaffLogin(
  request: StaffLoginRequestDto,
  now: Date = new Date(),
): Promise<ApplicationResult<StaffLoginResultDto>> {
  if (
    !request.shopSlug ||
    typeof request.shopSlug !== 'string' ||
    !request.username ||
    typeof request.username !== 'string' ||
    !request.password ||
    typeof request.password !== 'string'
  ) {
    return { ok: false, code: 'INVALID_INPUT', error: 'shopSlug, username and password are required' };
  }

  const shop = await findShopBySlug(request.shopSlug.trim().toLowerCase());
  const acc = shop ? await findStaffAccountByUsername(shop.id, request.username.trim().toLowerCase()) : null;
  const usable = !!acc && acc.isActive && !acc.isDeleted;

  const lockActive = usable && acc!.lockedUntil !== null && Date.parse(acc!.lockedUntil!) > now.getTime();
  if (lockActive) {
    return { ok: false, code: 'FORBIDDEN', error: 'ACCOUNT_LOCKED' };
  }

  // Run the verify even for an unknown or unusable account, against a dummy
  // hash, so the response takes the same amount of time either way — that is
  // what stops a wrong-password reply from being distinguishable from an
  // unknown-username reply.
  const passwordOk = await verifyPassword(request.password, usable ? acc!.passwordHash : await dummyPasswordHash());
  if (!usable) {
    return INVALID_CREDENTIALS;
  }

  const at = now.toISOString();

  if (!passwordOk) {
    const lockExpired = acc!.lockedUntil !== null; // not active (checked above), so this lock has expired
    const count = (lockExpired ? 0 : acc!.failedLoginCount) + 1;
    await replaceStaffAccount({
      ...acc!,
      failedLoginCount: count,
      lockedUntil:
        count >= MAX_FAILED_LOGINS ? new Date(now.getTime() + LOCKOUT_MINUTES * 60_000).toISOString() : null,
      updatedAt: at,
    });
    return INVALID_CREDENTIALS;
  }

  // Over the plan's login cap: only the oldest logins keep a seat. Nothing is deleted; raising the cap restores the rest.
  const seatLimit = limitOf(await loadEntitlements(shop!.id, now), PLAN_LIMIT_KEYS.STAFF_ACCOUNTS);
  if (seatLimit !== null && !seatHolderIds(await listStaffAccounts(shop!.id), seatLimit).has(acc!.id)) {
    return { ok: false, code: 'FORBIDDEN', error: SEAT_SUSPENDED_ERROR };
  }

  await replaceStaffAccount({
    ...acc!,
    failedLoginCount: 0,
    lockedUntil: null,
    lastLoginAt: at,
    updatedAt: at,
  });

  const { token, expiresAt } = await signStaffToken({ staffId: acc!.id, shopId: shop!.id, role: acc!.role }, now);

  return {
    ok: true,
    data: {
      token,
      expiresAt,
      shopId: shop!.id,
      shopSlug: shop!.slug,
      staffId: acc!.id,
      username: acc!.username,
      role: acc!.role,
    },
  };
}
