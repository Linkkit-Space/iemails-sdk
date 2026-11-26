import type { Requester } from '../common/requester';
import { query, seg, toWire } from '../common/utils';
import type { ApiObject, Deleted, List, PaginationOptions, RequestOptions, Response } from '../interfaces';

export interface Contact extends ApiObject<'contact'> {
  email: string;
  first_name: string | null;
  last_name: string | null;
  subscribed: boolean;
  properties: Record<string, unknown>;
}

export interface CreateContactOptions {
  email: string;
  firstName?: string;
  lastName?: string;
  /** Defaults to true. */
  subscribed?: boolean;
  properties?: Record<string, unknown>;
}

export type UpdateContactOptions = Partial<Omit<CreateContactOptions, 'email'>>;

export interface ListContactsOptions extends PaginationOptions {
  /** Search by email or name. */
  q?: string;
}

export class Contacts {
  constructor(private readonly req: Requester) {}

  create(params: CreateContactOptions, options: RequestOptions = {}): Promise<Response<Contact>> {
    return this.req('POST', '/contacts', toWire(params), options);
  }

  list(params: ListContactsOptions = {}, options: RequestOptions = {}): Promise<Response<List<Contact>>> {
    return this.req('GET', `/contacts${query(params)}`, undefined, options);
  }

  /** By contact id or email address. */
  get(idOrEmail: string, options: RequestOptions = {}): Promise<Response<Contact>> {
    return this.req('GET', `/contacts/${seg(idOrEmail)}`, undefined, options);
  }

  update(idOrEmail: string, params: UpdateContactOptions, options: RequestOptions = {}): Promise<Response<{ object: 'contact'; id: string; updated: true }>> {
    return this.req('PATCH', `/contacts/${seg(idOrEmail)}`, toWire(params), options);
  }

  remove(idOrEmail: string, options: RequestOptions = {}): Promise<Response<Deleted<'contact'>>> {
    return this.req('DELETE', `/contacts/${seg(idOrEmail)}`, undefined, options);
  }
}
