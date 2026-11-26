import type { Requester } from '../common/requester';
import { seg, toWire } from '../common/utils';
import type { ApiObject, Deleted, List, RequestOptions, Response } from '../interfaces';

export interface DnsRecord {
  type: string;
  name: string;
  value: string;
  status?: string;
  [key: string]: unknown;
}

export interface Domain extends ApiObject<'domain'> {
  name: string;
  status: 'pending' | 'verified' | 'failed' | (string & {});
  records?: DnsRecord[];
}

export interface CreateDomainOptions {
  /** e.g. `mail.example.com` */
  name: string;
  region?: string;
}

export class Domains {
  constructor(private readonly req: Requester) {}

  /** Add a sending domain. The response lists the DNS records to create; then call `verify`. */
  create(params: CreateDomainOptions, options: RequestOptions = {}): Promise<Response<Domain>> {
    return this.req('POST', '/domains', toWire(params), options);
  }

  list(options: RequestOptions = {}): Promise<Response<List<Domain>>> {
    return this.req('GET', '/domains', undefined, options);
  }

  /** A domain with its DNS records and the status of each. */
  get(id: string, options: RequestOptions = {}): Promise<Response<Domain>> {
    return this.req('GET', `/domains/${seg(id)}`, undefined, options);
  }

  /** Check the DNS records now and update the verification status. */
  verify(id: string, options: RequestOptions = {}): Promise<Response<Domain>> {
    return this.req('POST', `/domains/${seg(id)}/verify`, undefined, options);
  }

  remove(id: string, options: RequestOptions = {}): Promise<Response<Deleted<'domain'>>> {
    return this.req('DELETE', `/domains/${seg(id)}`, undefined, options);
  }
}
