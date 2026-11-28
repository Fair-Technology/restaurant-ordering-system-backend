export interface ApplicationError {
  ok: false;
  code: string;
  error: string;
  errorCode?: string;
  field?: string;
  max?: number;
  requestedCents?: number;
  availableCents?: number;
}

export interface ApplicationSuccess<T = any> {
  ok: true;
  data: T;
}

export type ApplicationResult<T = any> = ApplicationSuccess<T> | ApplicationError;
