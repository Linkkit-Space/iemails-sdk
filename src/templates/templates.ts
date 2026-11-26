import type { Requester } from '../common/requester';
import { query, seg, toWire } from '../common/utils';
import type { ApiObject, List, RequestOptions, Response } from '../interfaces';

export interface Template extends ApiObject<'template'> {
  name: string;
  slug: string;
  subject: string | null;
}

export interface CreateTemplateOptions {
  name: string;
  /** Used as `template` when sending. Generated from the name if left out. */
  slug?: string;
  subject?: string;
  preheader?: string;
  html?: string;
  description?: string;
  category?: string;
  defaultVariables?: Record<string, unknown>;
}

export interface UpdateTemplateOptions extends Partial<Omit<CreateTemplateOptions, 'slug'>> {
  /** Fails with CONFLICT if the draft changed since this revision. */
  expectedRevision?: number;
}

export class Templates {
  constructor(private readonly req: Requester) {}

  create(params: CreateTemplateOptions, options: RequestOptions = {}): Promise<Response<Template>> {
    return this.req('POST', '/templates', toWire(params), options);
  }

  list(params: { cursor?: string; archived?: boolean } = {}, options: RequestOptions = {}): Promise<Response<List<Template>>> {
    return this.req('GET', `/templates${query(params)}`, undefined, options);
  }

  /** The published version, unless `version` is `draft`. */
  get(id: string, params: { version?: 'published' | 'draft' } = {}, options: RequestOptions = {}): Promise<Response<Template>> {
    return this.req('GET', `/templates/${seg(id)}${query(params)}`, undefined, options);
  }

  /** Edit the draft. Publish it to use it in sends. */
  update(id: string, params: UpdateTemplateOptions, options: RequestOptions = {}): Promise<Response<Template>> {
    return this.req('PATCH', `/templates/${seg(id)}`, toWire(params), options);
  }

  publish(id: string, options: RequestOptions = {}): Promise<Response<Template>> {
    return this.req('POST', `/templates/${seg(id)}/publish`, undefined, options);
  }

  unpublish(id: string, options: RequestOptions = {}): Promise<Response<Template>> {
    return this.req('POST', `/templates/${seg(id)}/unpublish`, undefined, options);
  }

  /** Archive a template. */
  remove(id: string, options: RequestOptions = {}): Promise<Response<Template>> {
    return this.req('DELETE', `/templates/${seg(id)}`, undefined, options);
  }
}
