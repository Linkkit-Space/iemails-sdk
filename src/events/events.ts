import type { Requester } from '../common/requester';
import { toWire } from '../common/utils';
import type { ApiObject, RequestOptions, Response } from '../interfaces';

export interface TrackEventOptions {
  /** Event name, e.g. `trial_started`. Automations can trigger on it. */
  name: string;
  /** The contact's email address. */
  email: string;
  properties?: Record<string, unknown>;
  occurredAt?: Date | string;
}

/** Product events that drive automations. */
export class Events {
  constructor(private readonly req: Requester) {}

  track(params: TrackEventOptions, options: RequestOptions = {}): Promise<Response<ApiObject<'event'>>> {
    return this.req('POST', '/events', toWire(params), options);
  }
}
