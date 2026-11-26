import { HttpRequest } from '@azure/functions';
import { getSystemConfig, upsertSystemConfig } from '../../../infrastructure/cosmos/system/CosmosSystemConfigRepository';
import { ApplicationResult } from '../../_shared/types';
import { UpdateSystemConfigRequestDto, UpdateSystemConfigResultDto } from './dtos';
import { verifySuperAdminToken } from '../../../infrastructure/auth/superAdminAuthHelpers';
import { MAX_SCHEDULE_HORIZON_DAYS, MIN_SCHEDULE_HORIZON_DAYS } from '../../../domain/order/scheduling';
import { logAudit } from '../../_shared/auditHelpers';
import { logServiceFailure } from '../../_shared/logServiceFailure';

export async function executeUpdateSystemConfig(
  request: UpdateSystemConfigRequestDto,
  httpRequest: HttpRequest,
): Promise<ApplicationResult<UpdateSystemConfigResultDto>> {
  if (request.maxShopsDefault !== undefined) {
    if (typeof request.maxShopsDefault !== 'number') {
      return { ok: false, code: 'INVALID_INPUT', error: 'maxShopsDefault must be a number' };
    }
    if (!Number.isInteger(request.maxShopsDefault) || request.maxShopsDefault < 1) {
      return { ok: false, code: 'INVALID_INPUT', error: 'maxShopsDefault must be an integer >= 1' };
    }
  }
  if (request.emailEnabled !== undefined && typeof request.emailEnabled !== 'boolean') {
    return { ok: false, code: 'INVALID_INPUT', error: 'emailEnabled must be a boolean' };
  }
  if (request.scheduleHorizonDays !== undefined) {
    const d = request.scheduleHorizonDays;
    if (typeof d !== 'number' || !Number.isInteger(d) || d < MIN_SCHEDULE_HORIZON_DAYS || d > MAX_SCHEDULE_HORIZON_DAYS) {
      return {
        ok: false,
        code: 'INVALID_INPUT',
        error: `scheduleHorizonDays must be a whole number from ${MIN_SCHEDULE_HORIZON_DAYS} to ${MAX_SCHEDULE_HORIZON_DAYS}`,
      };
    }
  }
  if (
    request.maxShopsDefault === undefined &&
    request.emailEnabled === undefined &&
    request.scheduleHorizonDays === undefined
  ) {
    return { ok: false, code: 'INVALID_INPUT', error: 'No fields to update' };
  }

  try {
    const adminId = await verifySuperAdminToken(httpRequest);
    if (!adminId) {
      return { ok: false, code: 'FORBIDDEN', error: 'Superadmin access required' };
    }

    const previousConfig = await getSystemConfig();
    const patch: { maxShopsDefault?: number; emailEnabled?: boolean; scheduleHorizonDays?: number } = {};
    if (request.maxShopsDefault !== undefined) patch.maxShopsDefault = request.maxShopsDefault;
    if (request.emailEnabled !== undefined) patch.emailEnabled = request.emailEnabled;
    if (request.scheduleHorizonDays !== undefined) patch.scheduleHorizonDays = request.scheduleHorizonDays;
    const updated = await upsertSystemConfig(patch);

    if (patch.maxShopsDefault !== undefined && previousConfig.maxShopsDefault !== updated.maxShopsDefault) {
      await logAudit({
        shopId: 'platform',
        actorType: 'superadmin',
        actorId: adminId,
        action: 'config.maxShopsDefault.update',
        entityType: 'systemConfig',
        entityId: 'global',
        entityName: 'Global shop limit default',
        changes: [{ field: 'maxShopsDefault', from: previousConfig.maxShopsDefault, to: updated.maxShopsDefault }],
      });
    }
    if (patch.emailEnabled !== undefined && previousConfig.emailEnabled !== updated.emailEnabled) {
      await logAudit({
        shopId: 'platform',
        actorType: 'superadmin',
        actorId: adminId,
        action: 'config.emailEnabled.update',
        entityType: 'systemConfig',
        entityId: 'global',
        entityName: 'Platform order email',
        changes: [{ field: 'emailEnabled', from: previousConfig.emailEnabled === true, to: updated.emailEnabled }],
      });
    }
    if (patch.scheduleHorizonDays !== undefined && previousConfig.scheduleHorizonDays !== updated.scheduleHorizonDays) {
      await logAudit({
        shopId: 'platform',
        actorType: 'superadmin',
        actorId: adminId,
        action: 'config.scheduleHorizonDays.update',
        entityType: 'systemConfig',
        entityId: 'global',
        entityName: 'Booking-ahead limit',
        changes: [{ field: 'scheduleHorizonDays', from: previousConfig.scheduleHorizonDays, to: updated.scheduleHorizonDays }],
      });
    }

    return {
      ok: true,
      data: {
        maxShopsDefault: updated.maxShopsDefault,
        emailEnabled: updated.emailEnabled === true,
        scheduleHorizonDays: updated.scheduleHorizonDays,
      },
    };
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }
    logServiceFailure('updateSystemConfig', error);
    return { ok: false, code: 'INTERNAL_ERROR', error: 'Failed to update system config' };
  }
}
