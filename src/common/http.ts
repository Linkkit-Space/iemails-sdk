import type { IemailsError, RequestOptions, Response } from '../interfaces';
import { randomId } from './utils';

export type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface HttpConfig {
  apiKey: string | undefined;
  baseUrl: string;
  maxRetries: number;
  timeout: number;
  fetch: typeof fetch;
  headers: Record<string, string>;
  userAgent: string;
}

export interface CallOptions extends RequestOptions {
  /**
   * For POSTs that create things (sends): add an idempotency key when the
   * caller gave none, so a retry after a dropped connection can't send twice.
   */
  autoIdempotency?: boolean;
}

const RETRY_STATUSES = new Set([408, 409, 429, 500, 502, 503, 504]);
const SAFE_METHODS = new Set<Method>(['GET', 'PUT', 'DELETE']);

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason); }, { once: true });
  });

function backoff(attempt: number, retryAfter: string | null): number {
  const seconds = retryAfter ? Number(retryAfter) : NaN;
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 60_000);
  const base = 500 * 2 ** attempt;
  return Math.min(base + Math.random() * base * 0.25, 8_000);
}

function headersToObject(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  h.forEach((v, k) => { out[k] = v; });
  return out;
}

export async function request<T>(cfg: HttpConfig, method: Method, path: string, body?: unknown, opts: CallOptions = {}): Promise<Response<T>> {
  if (!cfg.apiKey) {
    return {
      data: null,
      headers: null,
      error: { code: 'MISSING_API_KEY', statusCode: null, message: 'Missing API key. Pass it to new IEmails("em_…") or set the IEMAILS_API_KEY environment variable.' },
    };
  }

  const idempotencyKey = opts.idempotencyKey ?? (opts.autoIdempotency && cfg.maxRetries > 0 ? randomId() : undefined);
  const headers: Record<string, string> = {
    authorization: `Bearer ${cfg.apiKey}`,
    accept: 'application/json',
    ...cfg.headers,
    ...opts.headers,
  };
  // A caller-set User-Agent (e.g. the CLI's) wins; browsers don't allow setting it at all.
  if (cfg.userAgent && !Object.keys(headers).some((k) => k.toLowerCase() === 'user-agent') && typeof (globalThis as { window?: unknown }).window === 'undefined') headers['user-agent'] = cfg.userAgent;
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;

  // A POST/PATCH is only retried when an idempotency key makes it safe.
  const retryable = SAFE_METHODS.has(method) || Boolean(idempotencyKey);
  const url = `${cfg.baseUrl}${path}`;
  const payload = body === undefined ? undefined : JSON.stringify(body);

  for (let attempt = 0; ; attempt++) {
    const timeout = AbortSignal.timeout(cfg.timeout);
    const signal = opts.signal ? anySignal([opts.signal, timeout]) : timeout;
    let res: globalThis.Response;
    try {
      res = await cfg.fetch(url, { method, headers, body: payload, signal });
    } catch (e) {
      if (!opts.signal?.aborted && retryable && attempt < cfg.maxRetries) {
        await sleep(backoff(attempt, null), opts.signal).catch(() => {});
        if (!opts.signal?.aborted) continue;
      }
      const aborted = opts.signal?.aborted;
      const timedOut = timeout.aborted && !aborted;
      return {
        data: null,
        headers: null,
        error: {
          code: 'APPLICATION_ERROR',
          statusCode: null,
          message: aborted ? 'The request was aborted' : timedOut ? `The request timed out after ${cfg.timeout} ms` : `Could not reach iemails: ${(e as Error)?.message ?? String(e)}`,
        },
      };
    }

    if (!res.ok && retryable && RETRY_STATUSES.has(res.status) && attempt < cfg.maxRetries) {
      await res.body?.cancel().catch(() => {});
      try {
        await sleep(backoff(attempt, res.headers.get('retry-after')), opts.signal);
        continue;
      } catch {
        // aborted while waiting: fall through and report this response
      }
    }

    const resHeaders = headersToObject(res.headers);
    const text = await res.text();
    let json: unknown = null;
    if (text) {
      try { json = JSON.parse(text); } catch { /* not JSON */ }
    }

    if (res.ok) return { data: (json ?? {}) as T, error: null, headers: resHeaders };

    const apiError = (json as { error?: { code?: string; message?: string; details?: IemailsError['details'] } } | null)?.error;
    const error: IemailsError = {
      code: apiError?.code ?? (res.status >= 500 ? 'INTERNAL_ERROR' : 'APPLICATION_ERROR'),
      message: apiError?.message ?? (text.slice(0, 500) || `HTTP ${res.status}`),
      statusCode: res.status,
    };
    if (apiError?.details) error.details = apiError.details;
    const requestId = res.headers.get('x-request-id');
    if (requestId) error.requestId = requestId;
    return { data: null, error, headers: resHeaders };
  }
}

/** AbortSignal.any with a fallback for runtimes that lack it (Node 20.0–20.2). */
function anySignal(signals: AbortSignal[]): AbortSignal {
  const any = (AbortSignal as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  if (any) return any(signals);
  const controller = new AbortController();
  for (const s of signals) {
    if (s.aborted) { controller.abort(s.reason); break; }
    s.addEventListener('abort', () => controller.abort(s.reason), { once: true });
  }
  return controller.signal;
}
