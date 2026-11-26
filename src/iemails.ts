import { Batch } from './batch/batch';
import { Broadcasts } from './broadcasts/broadcasts';
import { type CallOptions, type HttpConfig, type Method, request } from './common/http';
import type { Requester } from './common/requester';
import { readEnv } from './common/utils';
import { Contacts } from './contacts/contacts';
import { Domains } from './domains/domains';
import { Emails } from './emails/emails';
import { Events } from './events/events';
import { Inbound } from './inbound/inbound';
import { Inboxes } from './inboxes/inboxes';
import type { IemailsOptions, Response } from './interfaces';
import { Templates } from './templates/templates';
import { VERSION } from './version';
import { Webhooks } from './webhooks/webhooks';

export const DEFAULT_BASE_URL = 'https://api.iemails.co';

/**
 * The iemails client.
 *
 * ```ts
 * import { IEmails } from 'iemails';
 * const iemails = new IEmails(process.env.IEMAILS_API_KEY);
 * ```
 *
 * With no key it reads `IEMAILS_API_KEY`; `IEMAILS_BASE_URL` overrides the API URL.
 */
export class IEmails {
  readonly emails: Emails;
  readonly batch: Batch;
  readonly domains: Domains;
  readonly contacts: Contacts;
  readonly broadcasts: Broadcasts;
  readonly templates: Templates;
  readonly webhooks: Webhooks;
  readonly inbound: Inbound;
  readonly inboxes: Inboxes;
  readonly events: Events;

  readonly #config: HttpConfig;

  constructor(apiKey?: string, options: IemailsOptions = {}) {
    const fetchImpl = options.fetch ?? (globalThis.fetch?.bind(globalThis) as typeof fetch | undefined);
    if (!fetchImpl) throw new Error('iemails: no fetch implementation found. Use Node 20+ or pass { fetch } in the options.');

    this.#config = {
      apiKey: apiKey ?? readEnv('IEMAILS_API_KEY'),
      baseUrl: (options.baseUrl ?? readEnv('IEMAILS_BASE_URL') ?? DEFAULT_BASE_URL).replace(/\/+$/, ''),
      maxRetries: Math.max(0, options.maxRetries ?? 2),
      timeout: options.timeout ?? 30_000,
      fetch: fetchImpl,
      headers: options.headers ?? {},
      userAgent: `iemails-node/${VERSION}`,
    };

    const req: Requester = (method, path, body, opts) => request(this.#config, method, path, body, opts);
    this.emails = new Emails(req);
    this.batch = new Batch(req);
    this.domains = new Domains(req);
    this.contacts = new Contacts(req);
    this.broadcasts = new Broadcasts(req);
    this.templates = new Templates(req);
    this.webhooks = new Webhooks(req);
    this.inbound = new Inbound(req);
    this.inboxes = new Inboxes(req);
    this.events = new Events(req);
  }

  /** Call any endpoint the SDK doesn't wrap yet, with the same auth, retries and `{ data, error }` result. */
  request<T = unknown>(method: Method, path: string, body?: unknown, options: CallOptions = {}): Promise<Response<T>> {
    return request<T>(this.#config, method, path.startsWith('/') ? path : `/${path}`, body, options);
  }
}
