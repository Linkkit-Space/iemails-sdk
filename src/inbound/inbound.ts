import type { Requester } from '../common/requester';
import { query, seg } from '../common/utils';
import type { ApiObject, List, PaginationOptions, RequestOptions, Response } from '../interfaces';

export interface ReceivedEmail extends ApiObject<'received_email'> {
  from: string;
  to: string[];
  subject: string | null;
}

/** Mail received on your domains. */
export class Inbound {
  constructor(private readonly req: Requester) {}

  list(params: PaginationOptions = {}, options: RequestOptions = {}): Promise<Response<List<ReceivedEmail>>> {
    return this.req('GET', `/inbound${query(params)}`, undefined, options);
  }

  /** With body, headers and authentication results. */
  get(id: string, options: RequestOptions = {}): Promise<Response<ReceivedEmail>> {
    return this.req('GET', `/inbound/${seg(id)}`, undefined, options);
  }
}
