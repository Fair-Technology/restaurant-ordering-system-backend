import type { FulfilmentMode } from './Order';

// Collection is the only orderable mode until slice 5.
export const ORDERABLE_MODES: readonly FulfilmentMode[] = ['collection'];
export const ORDER_MODE_UNAVAILABLE_ERROR = 'Only collection orders are available at the moment';
