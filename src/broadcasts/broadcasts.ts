import type { Requester } from '../common/requester';
import { query, seg, toWire } from '../common/utils';
import type { ApiObject, Deleted, List, RequestOptions, Response } from '../interfaces';

export type BroadcastStatus = 'draft' | 'scheduled' | 'queued' | 'sending' | 'sent' | 'cancelled' | 'failed' | (string & {});

export interface Broadcast extends ApiObject<'broadcast'> {
  name: string;
  status: BroadcastStatus;
}

export interface CreateBroadcastOptions {
  /** Internal name, at least 2 characters. */
  name: string;
  subject?: string;
  preheader?: string;
  html?: string;
  /** Sender address on a verified domain. */
  from?: string;
  fromName?: string;
  replyTo?: string;
  templateId?: string;
  /** Audience segment to send to. */
  segmentId?: string;
  topicId?: string;
  domainId?: string;
  trackOpens?: boolean;
  trackClicks?: boolean;
  utmTags?: Record<string, string>;
}

export type UpdateBroadcastOptions = Partial<CreateBroadcastOptions>;

export class Broadcasts {
  constructor(private readonly req: Requester) {}

  /** Create a draft. Nothing is sent until `send`. */
  create(params: CreateBroadcastOptions, options: RequestOptions = {}): Promise<Response<Broadcast>> {
    return this.req('POST', '/broadcasts', toWire(params), options);
  }

  list(params: { status?: BroadcastStatus; cursor?: string } = {}, options: RequestOptions = {}): Promise<Response<List<Broadcast>>> {
    return this.req('GET', `/broadcasts${query(params)}`, undefined, options);
  }

  get(id: string, options: RequestOptions = {}): Promise<Response<Broadcast>> {
    return this.req('GET', `/broadcasts/${seg(id)}`, undefined, options);
  }

  /** Update a draft or scheduled broadcast. */
  update(id: string, params: UpdateBroadcastOptions, options: RequestOptions = {}): Promise<Response<Broadcast>> {
    return this.req('PATCH', `/broadcasts/${seg(id)}`, toWire(params), options);
  }

  /** Send to the audience now, or schedule with `scheduledAt`. This emails real people. */
  send(id: string, params: { scheduledAt?: Date | string } = {}, options: RequestOptions = {}): Promise<Response<Broadcast>> {
    return this.req('POST', `/broadcasts/${seg(id)}/send`, toWire(params), options);
  }

  cancel(id: string, options: RequestOptions = {}): Promise<Response<Broadcast>> {
    return this.req('POST', `/broadcasts/${seg(id)}/cancel`, undefined, options);
  }

  /** Delete a draft broadcast. */
  remove(id: string, options: RequestOptions = {}): Promise<Response<Deleted<'broadcast'>>> {
    return this.req('DELETE', `/broadcasts/${seg(id)}`, undefined, options);
  }
}
