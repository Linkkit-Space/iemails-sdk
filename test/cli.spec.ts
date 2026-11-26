import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { run, type RunContext } from '../cli/run';
import { VERSION } from '../src/version';
import { json } from './helpers';

function setup(responses: Response[] = [], opts: Partial<RunContext> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'iemails-cli-'));
  const out: string[] = [];
  const err: string[] = [];
  const calls: { url: string; method: string; headers: Record<string, string>; body: any }[] = [];
  const queue = [...responses];
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, method: init.method ?? 'GET', headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(init.body as string) : undefined });
    const next = queue.shift();
    if (!next) throw new Error('no more mocked responses');
    return next;
  });
  const ctx: RunContext = {
    io: { out: (t) => out.push(t), err: (t) => err.push(t), color: false },
    env: { IEMAILS_API_KEY: 'em_test_1234567890abcd' },
    interactive: true,
    fetch: fetch as unknown as typeof globalThis.fetch,
    configFile: join(dir, 'config.json'),
    pollMs: 1,
    ...opts,
  };
  return { ctx, out, err, calls, dir, cli: (...argv: string[]) => run(argv, ctx) };
}

const sent = { object: 'email', id: 'email_1', status: 'queued', scheduled_at: null };

describe('cli', () => {
  it('prints the version and help', async () => {
    const t = setup();
    expect(await t.cli('--version')).toBe(0);
    expect(t.out[0]).toBe(VERSION);
    expect(await t.cli('--help')).toBe(0);
    expect(t.out[1]).toContain('Usage: iemails <command>');
  });

  it('send maps flags to the API, with files, vars, tags and the CLI user agent', async () => {
    const t = setup([json(sent)]);
    const html = join(mkdtempSync(join(tmpdir(), 'iemails-cli-')), 'welcome.html');
    writeFileSync(html, '<p>Hi</p>');
    const code = await t.cli('send', '--from', 'Acme <hello@acme.dev>', '--to', 'a@x.io,b@x.io', '--cc', 'c@x.io', '--subject', 'Hi', '--html-file', html, '--tag', 'kind=welcome', '--reply-to', 'r@acme.dev', '--idempotency-key', 'k1');
    expect(code).toBe(0);
    expect(t.calls[0]!.url).toBe('https://api.iemails.co/emails');
    expect(t.calls[0]!.body).toEqual({ from: 'Acme <hello@acme.dev>', to: ['a@x.io', 'b@x.io'], cc: ['c@x.io'], reply_to: ['r@acme.dev'], subject: 'Hi', html: '<p>Hi</p>', tags: [{ name: 'kind', value: 'welcome' }] });
    expect(t.calls[0]!.headers['idempotency-key']).toBe('k1');
    expect(t.calls[0]!.headers['user-agent']).toBe(`iemails-cli/${VERSION} iemails-node/${VERSION}`);
    expect(t.out.join('\n')).toContain('Queued email_1');
  });

  it('send with a template passes variables', async () => {
    const t = setup([json(sent)]);
    await t.cli('send', '--from', 'a@acme.dev', '--to', 'b@x.io', '--template', 'welcome', '--var', 'firstName=Sam', '--var', 'plan=pro');
    expect(t.calls[0]!.body).toMatchObject({ template: 'welcome', variables: { firstName: 'Sam', plan: 'pro' } });
  });

  it('usage errors exit 2 without calling the API', async () => {
    const t = setup();
    expect(await t.cli('send', '--from', 'a@acme.dev', '--to', 'b@x.io', '--subject', 'x')).toBe(2);
    expect(t.err[0]).toContain('Give a body');
    expect(await t.cli('send', '--nope')).toBe(2);
    expect(await t.cli('frobnicate')).toBe(2);
    expect(t.calls).toHaveLength(0);
  });

  it('outputs JSON when not interactive (CI, agents) and exits 1 on API errors', async () => {
    const t = setup([json({ error: { code: 'DOMAIN_NOT_VERIFIED', message: 'not verified' } }, 403)], { interactive: false });
    const code = await t.cli('send', '--from', 'a@acme.dev', '--to', 'b@x.io', '--text', 'x');
    expect(code).toBe(1);
    expect(JSON.parse(t.out[0]!)).toEqual({ error: { code: 'DOMAIN_NOT_VERIFIED', message: 'not verified', statusCode: 403 } });
  });

  it('emails list renders a table, --json renders the raw list', async () => {
    const list = { object: 'list', data: [{ id: 'email_1', status: 'delivered', to: ['a@x.io'], subject: 'Hi', created_at: '2026-11-26T05:00:00.000Z' }], has_more: false, next_cursor: null };
    const t = setup([json(list), json(list)]);
    await t.cli('emails', 'list', '--status', 'delivered', '--limit', '5');
    expect(t.calls[0]!.url).toBe('https://api.iemails.co/emails?status=delivered&limit=5');
    expect(t.out[0]).toMatch(/ID\s+STATUS\s+TO\s+SUBJECT\s+CREATED/);
    expect(t.out[0]).toContain('email_1');
    await t.cli('emails', 'list', '--json');
    expect(JSON.parse(t.out[1]!).data[0].id).toBe('email_1');
  });

  it('emails watch prints new events and exits 0 once delivered', async () => {
    const ev = (id: string, type: string) => ({ object: 'email_event', id, type, recipient: 'a@x.io', data: {}, occurred_at: '2026-11-26T05:00:00.000Z' });
    const t = setup([
      json({ object: 'email', id: 'email_1', status: 'queued', to: [], events: [ev('e1', 'queued')] }),
      json({ object: 'email', id: 'email_1', status: 'delivered', to: [], events: [ev('e1', 'queued'), ev('e2', 'sent'), ev('e3', 'delivered')] }),
    ]);
    expect(await t.cli('emails', 'watch', 'email_1')).toBe(0);
    expect(t.out.map((l) => l.split(/\s+/)[2])).toEqual(['queued', 'sent', 'delivered']);
  });

  it('domains add shows the DNS records', async () => {
    const t = setup([json({ object: 'domain', id: 'dom_1', name: 'mail.acme.dev', status: 'pending', records: [{ record: 'TXT', name: 'send._domainkey.mail.acme.dev', value: 'v=DKIM1; k=rsa; p=abc', priority: null, status: 'pending', required: true, last_checked_at: null }] })]);
    expect(await t.cli('domains', 'add', 'mail.acme.dev')).toBe(0);
    expect(t.calls[0]!.body).toEqual({ name: 'mail.acme.dev' });
    expect(t.out[0]).toContain('send._domainkey.mail.acme.dev');
    expect(t.out[0]).toContain('TXT');
  });

  it('broadcasts send refuses without --yes', async () => {
    const t = setup();
    expect(await t.cli('broadcasts', 'send', 'bc_1')).toBe(2);
    expect(t.err[0]).toContain('--yes');
    expect(t.calls).toHaveLength(0);
  });

  it('login validates the key, saves it 0600 and later commands use it', async () => {
    const t = setup([json({ object: 'list', data: [] }), json({ object: 'list', data: [] })], { env: {} });
    expect(await t.cli('login', '--key', 'em_live_saved_key_9999')).toBe(0);
    expect(t.calls[0]!.headers.authorization).toBe('Bearer em_live_saved_key_9999');
    const saved = JSON.parse(readFileSync(t.ctx.configFile!, 'utf8'));
    expect(saved).toEqual({ current: 'default', profiles: { default: { apiKey: 'em_live_saved_key_9999' } } });
    expect(statSync(t.ctx.configFile!).mode & 0o777).toBe(0o600);
    expect(t.out[0]).not.toContain('em_live_saved_key_9999');
    await t.cli('domains', 'list');
    expect(t.calls[1]!.headers.authorization).toBe('Bearer em_live_saved_key_9999');
  });

  it('login rejects an invalid key and saves nothing', async () => {
    const t = setup([json({ error: { code: 'UNAUTHORIZED', message: 'Invalid API key' } }, 401)], { env: {} });
    expect(await t.cli('login', '--key', 'em_bad')).toBe(1);
    expect(() => readFileSync(t.ctx.configFile!, 'utf8')).toThrow();
  });

  it('api passes method, path and JSON body through', async () => {
    const t = setup([json({ ok: true })]);
    expect(await t.cli('api', 'post', '/events', '--data', '{"name":"signup","email":"a@x.io"}')).toBe(0);
    expect(t.calls[0]).toMatchObject({ method: 'POST', url: 'https://api.iemails.co/events', body: { name: 'signup', email: 'a@x.io' } });
  });

  it('doctor reports unverified domains and exits 1', async () => {
    const t = setup([json({ object: 'list', data: [{ id: 'dom_1', name: 'mail.acme.dev', status: 'pending' }] })]);
    expect(await t.cli('doctor')).toBe(1);
    const text = t.out.join('\n');
    expect(text).toContain('✓ API access');
    expect(text).toContain('✗ Domain mail.acme.dev');
  });
});

describe('iemails mcp (stdio bridge)', () => {
  it('forwards each JSON-RPC line to the hosted server and writes replies in order', async () => {
    const { PassThrough } = await import('node:stream');
    const input = new PassThrough();
    const output = new PassThrough();
    const lines: string[] = [];
    output.on('data', (b: Buffer) => lines.push(...b.toString().split('\n').filter(Boolean)));
    const t = setup([
      json({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-06-18', serverInfo: { name: 'iemails' } } }),
      new Response(null, { status: 202 }),
      json({ jsonrpc: '2.0', id: 2, result: { tools: [{ name: 'send_email' }] } }),
    ], { stdin: input, stdout: output, env: { IEMAILS_API_KEY: 'em_test_mcp', IEMAILS_FROM: 'Acme <hello@acme.dev>' } });
    const done = t.cli('mcp');
    input.write('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n');
    input.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
    input.write('{"jsonrpc":"2.0","id":2,"method":"tools/list"}\n');
    input.end();
    expect(await done).toBe(0);
    expect(t.calls.map((c) => c.url)).toEqual(['https://iemails.co/api/mcp', 'https://iemails.co/api/mcp', 'https://iemails.co/api/mcp']);
    expect(t.calls[0]!.headers.authorization).toBe('Bearer em_test_mcp');
    expect(t.calls[0]!.headers['x-iemails-from']).toBe('Acme <hello@acme.dev>');
    expect(t.calls[2]!.headers['mcp-protocol-version']).toBe('2025-06-18');
    expect(lines.map((l) => JSON.parse(l).id)).toEqual([1, 2]);
    expect(JSON.parse(lines[1]!).result.tools[0].name).toBe('send_email');
  });

  it('answers with a JSON-RPC error when the server cannot be reached, and refuses to start without a key', async () => {
    const { PassThrough } = await import('node:stream');
    const input = new PassThrough();
    const output = new PassThrough();
    const lines: string[] = [];
    output.on('data', (b: Buffer) => lines.push(...b.toString().split('\n').filter(Boolean)));
    const t = setup([], { stdin: input, stdout: output });
    const done = t.cli('mcp', '--url', 'http://localhost:9/api/mcp');
    input.end('{"jsonrpc":"2.0","id":7,"method":"tools/list"}\n');
    expect(await done).toBe(0);
    expect(JSON.parse(lines[0]!)).toMatchObject({ id: 7, error: { code: -32603 } });

    const noKey = setup([], { env: {}, stdin: new PassThrough(), stdout: new PassThrough() });
    expect(await noKey.cli('mcp')).toBe(1);
    expect(noKey.err[0]).toContain('no API key');
  });
});
