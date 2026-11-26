/** Error codes the iemails API returns, plus the SDK's own for failures before a response. */
export type IemailsErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'DOMAIN_NOT_VERIFIED'
  | 'SUPPRESSED_RECIPIENT'
  | 'INSUFFICIENT_PLAN'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNAVAILABLE'
  | 'INTERNAL_ERROR'
  /** No API key was given and IEMAILS_API_KEY is not set. */
  | 'MISSING_API_KEY'
  /** The request never got a response: network failure, timeout or abort. */
  | 'APPLICATION_ERROR';

export interface IemailsError {
  code: IemailsErrorCode | (string & {});
  message: string;
  /** HTTP status, or null when no response was received. */
  statusCode: number | null;
  /** Field-level problems for VALIDATION_ERROR. */
  details?: { path: string; message: string }[];
  /** Matches the X-Request-Id in iemails Logs. */
  requestId?: string;
}

/**
 * Every method resolves to `{ data, error }` and never throws for API errors.
 * Exactly one of the two is non-null.
 */
export type Response<T> =
  | { data: T; error: null; headers: Record<string, string> }
  | { data: null; error: IemailsError; headers: Record<string, string> | null };

export interface RequestOptions {
  /** Makes an unsafe request safe to retry. Sends the `Idempotency-Key` header. Max 255 chars. */
  idempotencyKey?: string;
  /** Extra request headers, e.g. a trace id. */
  headers?: Record<string, string>;
  /** Cancel the request, e.g. `AbortSignal.timeout(5000)`. */
  signal?: AbortSignal;
}

export interface List<T> {
  object: 'list';
  data: T[];
  has_more: boolean;
  next_cursor: string | null;
}

export interface PaginationOptions {
  limit?: number;
  /** The `next_cursor` from the previous page. */
  cursor?: string;
}

export interface Deleted<O extends string> {
  object: O;
  id: string;
  deleted: true;
}

export interface IemailsOptions {
  /** Defaults to https://api.iemails.co */
  baseUrl?: string;
  /** Retries for rate limits, 5xx and network errors. Default 2. Set 0 to turn off. */
  maxRetries?: number;
  /** Per-attempt timeout in ms. Default 30000. */
  timeout?: number;
  /** A custom fetch, e.g. for proxies or tests. Defaults to the global fetch. */
  fetch?: typeof fetch;
  /** Headers sent with every request. */
  headers?: Record<string, string>;
}

/** An API object whose full shape is not typed yet; `object` and `id` are always present. */
export interface ApiObject<O extends string> {
  object: O;
  id: string;
  [key: string]: unknown;
}
