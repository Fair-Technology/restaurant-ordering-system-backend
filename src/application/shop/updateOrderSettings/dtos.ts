import type { OrderSettings, StoredOrderSettings } from '../../../domain/order/orderSettings';

export type UpdateOrderSettingsBody = StoredOrderSettings; // every field optional; absent = keep
export type OrderSettingsResultDto = OrderSettings; // the full merged record after saving
