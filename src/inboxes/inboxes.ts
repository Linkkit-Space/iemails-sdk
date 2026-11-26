import type { Requester } from '../common/requester';
import { query, seg, toWire } from '../common/utils';
import { emailBody } from '../emails/emails';
import type { Attachment } from '../emails/interfaces';
import type { ApiObject, Deleted, List, RequestOptions, Response } from '../interfaces';

export interface Inbox extends ApiObject<'inbox'> {
  email_address: string;
  name: string | null;
}

export interface Thread extends ApiObject<'thread'> {
  subject: string | null;
}

export interface Label extends ApiObject<'label'> {
  name: string;
  color: string | null;
}

export interface Draft extends ApiObject<'draft'> {}

export interface CreateInboxOptions {
  /** The address that receives mail, on a verified domain. */
  emailAddress: string;
  name?: string;
  fromName?: string;
  forwarding?: unknown;
}

export interface ListThreadsOptions {
  /** e.g. `['inbox', 'sent']` */
  folders?: string[];
  /** Label ids. */
  labels?: string[];
  read?: boolean;
  limit?: number;
  /** Pagination cursor from the previous page. */
  after?: string;
}

export interface MessageOptions {
  to?: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject?: string;
  html?: string;
  text?: string;
  headers?: Record<string, string>;
  attachments?: Attachment[];
}

export interface CreateDraftOptions extends Omit<MessageOptions, 'headers'> {
  threadId?: string;
  replyToEmailId?: string;
}

const messageBody = (m: object) => emailBody(m as Parameters<typeof emailBody>[0]);

class Threads {
  constructor(private readonly req: Requester) {}

  list(inboxId: string, params: ListThreadsOptions = {}, options: RequestOptions = {}): Promise<Response<List<Thread>>> {
    return this.req('GET', `/inboxes/${seg(inboxId)}/threads${query(params)}`, undefined, options);
  }

  search(inboxId: string, params: { query: string; limit?: number; after?: string }, options: RequestOptions = {}): Promise<Response<List<Thread>>> {
    return this.req('GET', `/inboxes/${seg(inboxId)}/threads/search${query(params)}`, undefined, options);
  }

  /** A conversation with every message in it. */
  get(inboxId: string, threadId: string, options: RequestOptions = {}): Promise<Response<Thread>> {
    return this.req('GET', `/inboxes/${seg(inboxId)}/threads/${seg(threadId)}`, undefined, options);
  }

  /** Mark read/unread or move to a folder. */
  update(inboxId: string, threadId: string, params: { read?: boolean; folder?: string }, options: RequestOptions = {}): Promise<Response<Thread>> {
    return this.req('PATCH', `/inboxes/${seg(inboxId)}/threads/${seg(threadId)}`, toWire(params), options);
  }

  /** Move to trash. */
  remove(inboxId: string, threadId: string, options: RequestOptions = {}): Promise<Response<Thread>> {
    return this.req('DELETE', `/inboxes/${seg(inboxId)}/threads/${seg(threadId)}`, undefined, options);
  }

  listEmails(inboxId: string, threadId: string, options: RequestOptions = {}): Promise<Response<List<ApiObject<'email'>>>> {
    return this.req('GET', `/inboxes/${seg(inboxId)}/threads/${seg(threadId)}/emails`, undefined, options);
  }

  getEmail(inboxId: string, threadId: string, emailId: string, options: RequestOptions = {}): Promise<Response<ApiObject<'email'>>> {
    return this.req('GET', `/inboxes/${seg(inboxId)}/threads/${seg(threadId)}/emails/${seg(emailId)}`, undefined, options);
  }

  /** Reply from the inbox address, keeping the conversation threaded. */
  reply(inboxId: string, threadId: string, emailId: string, params: Omit<MessageOptions, 'to'>, options: RequestOptions = {}): Promise<Response<ApiObject<'email'>>> {
    return this.req('POST', `/inboxes/${seg(inboxId)}/threads/${seg(threadId)}/emails/${seg(emailId)}/reply`, messageBody(params), { ...options, autoIdempotency: true });
  }

  forward(inboxId: string, threadId: string, emailId: string, params: MessageOptions & { to: string | string[] }, options: RequestOptions = {}): Promise<Response<ApiObject<'email'>>> {
    return this.req('POST', `/inboxes/${seg(inboxId)}/threads/${seg(threadId)}/emails/${seg(emailId)}/forward`, messageBody(params), { ...options, autoIdempotency: true });
  }

  addLabels(inboxId: string, threadId: string, labels: string[], options: RequestOptions = {}): Promise<Response<Thread>> {
    return this.req('POST', `/inboxes/${seg(inboxId)}/threads/${seg(threadId)}/labels`, { labels }, options);
  }

  /** Replace all labels on the thread. */
  setLabels(inboxId: string, threadId: string, labels: string[], options: RequestOptions = {}): Promise<Response<Thread>> {
    return this.req('PUT', `/inboxes/${seg(inboxId)}/threads/${seg(threadId)}/labels`, { labels }, options);
  }

  removeLabel(inboxId: string, threadId: string, labelId: string, options: RequestOptions = {}): Promise<Response<Thread>> {
    return this.req('DELETE', `/inboxes/${seg(inboxId)}/threads/${seg(threadId)}/labels/${seg(labelId)}`, undefined, options);
  }
}

class Labels {
  constructor(private readonly req: Requester) {}

  list(inboxId: string, options: RequestOptions = {}): Promise<Response<List<Label>>> {
    return this.req('GET', `/inboxes/${seg(inboxId)}/labels`, undefined, options);
  }

  create(inboxId: string, params: { name: string; color?: string }, options: RequestOptions = {}): Promise<Response<Label>> {
    return this.req('POST', `/inboxes/${seg(inboxId)}/labels`, toWire(params), options);
  }

  update(inboxId: string, labelId: string, params: { name?: string; color?: string }, options: RequestOptions = {}): Promise<Response<Label>> {
    return this.req('PATCH', `/inboxes/${seg(inboxId)}/labels/${seg(labelId)}`, toWire(params), options);
  }

  remove(inboxId: string, labelId: string, options: RequestOptions = {}): Promise<Response<Deleted<'label'>>> {
    return this.req('DELETE', `/inboxes/${seg(inboxId)}/labels/${seg(labelId)}`, undefined, options);
  }
}

class Drafts {
  constructor(private readonly req: Requester) {}

  list(inboxId: string, options: RequestOptions = {}): Promise<Response<List<Draft>>> {
    return this.req('GET', `/inboxes/${seg(inboxId)}/drafts`, undefined, options);
  }

  create(inboxId: string, params: CreateDraftOptions, options: RequestOptions = {}): Promise<Response<Draft>> {
    return this.req('POST', `/inboxes/${seg(inboxId)}/drafts`, messageBody(params), options);
  }

  get(inboxId: string, draftId: string, options: RequestOptions = {}): Promise<Response<Draft>> {
    return this.req('GET', `/inboxes/${seg(inboxId)}/drafts/${seg(draftId)}`, undefined, options);
  }

  update(inboxId: string, draftId: string, params: Omit<MessageOptions, 'headers'>, options: RequestOptions = {}): Promise<Response<Draft>> {
    return this.req('PATCH', `/inboxes/${seg(inboxId)}/drafts/${seg(draftId)}`, messageBody(params), options);
  }

  send(inboxId: string, draftId: string, options: RequestOptions = {}): Promise<Response<ApiObject<'email'>>> {
    return this.req('POST', `/inboxes/${seg(inboxId)}/drafts/${seg(draftId)}/send`, undefined, { ...options, autoIdempotency: true });
  }

  remove(inboxId: string, draftId: string, options: RequestOptions = {}): Promise<Response<Deleted<'draft'>>> {
    return this.req('DELETE', `/inboxes/${seg(inboxId)}/drafts/${seg(draftId)}`, undefined, options);
  }
}

/** Inboxes: addresses that receive mail, with threads, labels and drafts. */
export class Inboxes {
  readonly threads: Threads;
  readonly labels: Labels;
  readonly drafts: Drafts;

  constructor(private readonly req: Requester) {
    this.threads = new Threads(req);
    this.labels = new Labels(req);
    this.drafts = new Drafts(req);
  }

  create(params: CreateInboxOptions, options: RequestOptions = {}): Promise<Response<Inbox>> {
    return this.req('POST', '/inboxes', toWire(params), options);
  }

  list(options: RequestOptions = {}): Promise<Response<List<Inbox>>> {
    return this.req('GET', '/inboxes', undefined, options);
  }

  get(inboxId: string, options: RequestOptions = {}): Promise<Response<Inbox>> {
    return this.req('GET', `/inboxes/${seg(inboxId)}`, undefined, options);
  }

  update(inboxId: string, params: { name?: string; fromName?: string }, options: RequestOptions = {}): Promise<Response<Inbox>> {
    return this.req('PATCH', `/inboxes/${seg(inboxId)}`, toWire(params), options);
  }

  remove(inboxId: string, options: RequestOptions = {}): Promise<Response<Deleted<'inbox'>>> {
    return this.req('DELETE', `/inboxes/${seg(inboxId)}`, undefined, options);
  }
}
