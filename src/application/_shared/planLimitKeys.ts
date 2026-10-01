export const PLAN_LIMIT_KEYS = {
  ORDERS_PER_MONTH: 'ORDERS_PER_MONTH',
  STAFF_ACCOUNTS: 'STAFF_ACCOUNTS',
} as const;

export type PlanLimitKey = typeof PLAN_LIMIT_KEYS[keyof typeof PLAN_LIMIT_KEYS];
