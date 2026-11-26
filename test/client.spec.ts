import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IEmails, VERSION } from '../src';
import { json, mockClient } from './helpers';

describe('client', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('VERSION matches package.json', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(VERSION).toBe(pkg.version);
  });

  it('sends auth, user agent and JSON headers to the default base URL', async () => {
    const { client, calls } = mockClient([json({ object: 'list', data: [], has_more: false, next_cursor: null })]);
    const { data, error } = await client.domains.list();
    expect(error).toBeNull();
    expect(data?.object).toBe('list');
    expect(calls[0]!.url).toBe('https://api.iemails.co/domains');
    expect(calls[0]!.headers.authorization).toBe('Bearer em_test_123');
    expect(calls[0]!.headers['user-agent']).toBe(`iemails-node/${VERSION}`);
  });

  it('reads IEMAILS_API_KEY and IEMAILS_BASE_URL when nothing is passed', async () => {
    vi.stubEnv('IEMAILS_API_KEY', 'em_env');
    vi.stubEnv('IEMAILS_BASE_URL', 'http://localhost:3500/api/v1/');
    const fetch = vi.fn(async () => json({ object: 'list', data: [] }));
    const client = new IEmails(undefined, { fetch: fetch as unknown as typeof globalThis.fetch });
    await client.webhooks.list();
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://localhost:3500/api/v1/webhooks');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer em_env');
  });

  it('returns MISSING_API_KEY instead of calling the API', async () => {
    vi.stubEnv('IEMAILS_API_KEY', '');
    const fetch = vi.fn();
    const client = new IEmails(undefined, { fetch: fetch as unknown as typeof globalThis.fetch });
    const { data, error } = await client.emails.get('em_1');
    expect(data).toBeNull();
    expect(error?.code).toBe('MISSING_API_KEY');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('maps API errors to { error } with code, details and request id', async () => {
    const { client } = mockClient([
      json({ error: { code: 'VALIDATION_ERROR', message: '`to` is required', details: [{ path: 'to', message: 'Required' }] } }, 422, { 'x-request-id': 'req_1' }),
    ]);
    const { data, error } = await client.emails.send({ from: 'a@acme.dev', to: [] });
    expect(data).toBeNull();
    expect(error).toEqual({ code: 'VALIDATION_ERROR', message: '`to` is required', statusCode: 422, details: [{ path: 'to', message: 'Required' }], requestId: 'req_1' });
  });

  it('retries GETs on 429, honouring Retry-After', async () => {
    const { client, calls } = mockClient([json({ error: { code: 'RATE_LIMITED', message: 'slow down' } }, 429, { 'retry-after': '0' }), json({ object: 'email', id: 'em_1' })]);
    const { data } = await client.emails.get('em_1');
    expect(data?.id).toBe('em_1');
    expect(calls).toHaveLength(2);
  });

  it('retries a send after a network error with the same idempotency key', async () => {
    const { client, calls } = mockClient([new TypeError('fetch failed'), json({ object: 'email', id: 'em_2', status: 'queued', scheduled_at: null })]);
    const { data } = await client.emails.send({ from: 'a@acme.dev', to: 'b@x.io', subject: 'Hi', text: 'Hi' });
    expect(data?.id).toBe('em_2');
    expect(calls).toHaveLength(2);
    const key = calls[0]!.headers['idempotency-key'];
    expect(key).toBeTruthy();
    expect(calls[1]!.headers['idempotency-key']).toBe(key);
  });

  it('never retries a PATCH without an idempotency key', async () => {
    const { client, calls } = mockClient([json({ error: { code: 'UNAVAILABLE', message: 'down' } }, 503)]);
    const { error } = await client.contacts.update('a@b.co', { firstName: 'A' });
    expect(error?.statusCode).toBe(503);
    expect(calls).toHaveLength(1);
  });

  it('gives up after maxRetries and reports the network failure', async () => {
    const { client, calls } = mockClient([new TypeError('fetch failed'), new TypeError('fetch failed')], { maxRetries: 1 });
    const { error } = await client.domains.list();
    expect(error?.code).toBe('APPLICATION_ERROR');
    expect(error?.statusCode).toBeNull();
    expect(calls).toHaveLength(2);
  });

  it('request() reaches endpoints the SDK does not wrap', async () => {
    const { client, calls } = mockClient([json({ ok: true })]);
    const { data } = await client.request<{ ok: boolean }>('GET', 'smtp/verify');
    expect(data?.ok).toBe(true);
    expect(calls[0]!.url).toBe('https://api.iemails.co/smtp/verify');
  });
});
