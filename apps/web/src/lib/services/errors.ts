/**
 * A normalized client-side error. Both adapters (mock + live) throw this so UI
 * code can switch on a stable `code` (from ERROR_CODES) regardless of transport.
 */
export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
  }
}

export function isApiClientError(e: unknown): e is ApiClientError {
  return e instanceof ApiClientError;
}
