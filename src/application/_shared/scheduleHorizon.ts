import {
  DEFAULT_SCHEDULE_HORIZON_DAYS,
  MAX_SCHEDULE_HORIZON_DAYS,
  MIN_SCHEDULE_HORIZON_DAYS,
} from '../../domain/order/scheduling';
import { getSystemConfig } from '../../infrastructure/cosmos/system/CosmosSystemConfigRepository';
import { logServiceFailure } from './logServiceFailure';

/** How many days ahead a diner may book; the default when the setting cannot be read. */
export async function getScheduleHorizonDays(): Promise<number> {
  try {
    const config = await getSystemConfig();
    const days = config.scheduleHorizonDays;
    return typeof days === 'number' &&
      Number.isInteger(days) &&
      days >= MIN_SCHEDULE_HORIZON_DAYS &&
      days <= MAX_SCHEDULE_HORIZON_DAYS
      ? days
      : DEFAULT_SCHEDULE_HORIZON_DAYS;
  } catch (error) {
    logServiceFailure('getScheduleHorizonDays', error);
    return DEFAULT_SCHEDULE_HORIZON_DAYS;
  }
}
