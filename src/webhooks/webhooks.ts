import type { Requester } from '../common/requester';
import { seg, toWire } from '../common/utils';
import type { ApiObject, Deleted, List, RequestOptions, Response } from '../interfaces';

export const WEBHOOK_EVENT_TYPES = [
  'email.queued',
  'email.sent',
  'email.delivered',
  'email.delivery_delayed',
  'email.opened',
  'email.clicked',
  'email.bounced',
  'email.complained',
  'email.failed',
  'contact.created',
  'contact.updated',
  'contact.unsubscribed',
  'broadcast.sent',
  'email.received',
  'inbox.created',
  'inbox.updated',
  'inbox.deleted',
  'inbox.thread.created',
  'inbox.thread.folder.updated',
  'inbox.thread.labels.updated',
  'inbox.email.received',
  'inbox.email.sent',
  'inbox.draft.created',
  'inbox.draft.updated',
  'inbox.draft.sent',
  'inbox.draft.deleted',
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export interface Webhook extends ApiObject<'webhook'> {
  url: string;
  events: WebhookEventType[];
}

export interface CreateWebhookOptions {
  /** Your HTTPS endpoint. */
  url: string;
  events: WebhookEventType[];
  description?: string;
}

/** A delivered webhook payload. Fields beyond `type` depend on the event. */
export interface WebhookEvent {
  type: WebhookEventType | (string & {});
  [key: string]: unknown;
}

export interface VerifyWebhookOptions {
  /** The raw request body, exactly as received. Don't parse and re-stringify it. */
  payload: string;
  /**
   * The request headers: a `Headers` object, a plain object, or the three
   * values `{ id, timestamp, signature }` from `webhook-id`,
   * `webhook-timestamp` and `webhook-signature`.
   */
  headers: Headers | Record<string, string | string[] | undefined> | { id: string; timestamp: string; signature: string };
  /** The endpoint's signing secret (`whsec_…`), shown once when it was created. */
  secret: string;
  /** Reject events older or newer than this. Default 300 seconds. */
  toleranceSeconds?: number;
}

export class WebhookVerificationError extends Error {
  override name = 'WebhookVerificationError';
}

function header(h: VerifyWebhookOptions['headers'], name: string): string | undefined {
  if (typeof (h as Headers).get === 'function') return (h as Headers).get(name) ?? undefined;
  const rec = h as Record<string, string | string[] | undefined>;
  const v = rec[name] ?? rec[name.toLowerCase()] ?? Object.entries(rec).find(([k]) => k.toLowerCase() === name)?.[1];
  return Array.isArray(v) ? v[0] : v;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const subtle = (globalThis as { crypto?: Crypto }).crypto?.subtle;
  if (!subtle) throw new WebhookVerificationError('Web Crypto is not available in this runtime');
  const key = await subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await subtle.sign('HMAC', key, enc.encode(message)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Check a webhook's signature and age, then return the parsed event.
 * Throws `WebhookVerificationError` if it doesn't check out. Works in Node,
 * Bun, Deno and edge runtimes (uses Web Crypto).
 */
export async function verifyWebhook(opts: VerifyWebhookOptions): Promise<WebhookEvent> {
  const h = opts.headers as { id?: string; timestamp?: string; signature?: string };
  const id = typeof h.id === 'string' && typeof h.signature === 'string' ? h.id : header(opts.headers, 'webhook-id');
  const ts = typeof h.timestamp === 'string' && typeof h.signature === 'string' ? h.timestamp : header(opts.headers, 'webhook-timestamp');
  const signature = typeof h.signature === 'string' ? h.signature : header(opts.headers, 'webhook-signature');
  if (!id || !ts || !signature) throw new WebhookVerificationError('Missing webhook-id, webhook-timestamp or webhook-signature header');

  const timestamp = Number(ts);
  if (!Number.isFinite(timestamp)) throw new WebhookVerificationError('Invalid webhook-timestamp');
  const tolerance = opts.toleranceSeconds ?? 300;
  if (Math.abs(Date.now() / 1000 - timestamp) > tolerance) throw new WebhookVerificationError('Webhook timestamp is outside the allowed tolerance');

  const expected = `v1,${await hmacHex(opts.secret, `${id}.${timestamp}.${opts.payload}`)}`;
  // Accept a space-separated list so secret rotation can send two signatures.
  const ok = signature.split(' ').some((s) => timingSafeEqual(s.trim(), expected));
  if (!ok) throw new WebhookVerificationError('Webhook signature does not match');

  try {
    return JSON.parse(opts.payload) as WebhookEvent;
  } catch {
    throw new WebhookVerificationError('Webhook payload is not valid JSON');
  }
}

export class Webhooks {
  constructor(private readonly req: Requester) {}

  /** Register an endpoint. The response's `signing_secret` is shown only this once. */
  create(params: CreateWebhookOptions, options: RequestOptions = {}): Promise<Response<Webhook & { signing_secret: string }>> {
    return this.req('POST', '/webhooks', toWire(params), options);
  }

  list(options: RequestOptions = {}): Promise<Response<List<Webhook>>> {
    return this.req('GET', '/webhooks', undefined, options);
  }

  remove(id: string, options: RequestOptions = {}): Promise<Response<Deleted<'webhook'>>> {
    return this.req('DELETE', `/webhooks/${seg(id)}`, undefined, options);
  }

  /** Same as the standalone `verifyWebhook`. */
  verify(opts: VerifyWebhookOptions): Promise<WebhookEvent> {
    return verifyWebhook(opts);
  }
}
