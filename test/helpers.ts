import { vi } from 'vitest';
import { IEmails } from '../src';

export interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: any;
}

/** A client whose fetch replays the given responses and records every call. */
export function mockClient(responses: (Response | Error)[], options: ConstructorParameters<typeof IEmails>[1] = {}) {
  const calls: Call[] = [];
  const queue = [...responses];
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({
      url,
      method: init.method ?? 'GET',
      headers: init.headers as Record<string, string>,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    });
    const next = queue.shift();
    if (!next) throw new Error('no more mocked responses');
    if (next instanceof Error) throw next;
    return next;
  });
  const client = new IEmails('em_test_123', { fetch: fetch as unknown as typeof globalThis.fetch, ...options });
  return { client, calls, fetch };
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
