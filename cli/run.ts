import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseArgs } from 'node:util';
import { IEmails } from '../src/iemails';
import type { Response } from '../src/interfaces';
import { VERSION } from '../src/version';
import { WEBHOOK_EVENT_TYPES, type WebhookEventType } from '../src/webhooks/webhooks';
import { type ConfigFile, configPath, maskKey, readConfig, writeConfig } from './config';
import { DEFAULT_MCP_URL, runMcpBridge } from './mcp';
import { bold, dim, green, type Io, red, status, table, when, yellow } from './format';

export interface RunContext {
  io: Io;
  env: NodeJS.ProcessEnv;
  /** True when a person is at the terminal: human output. Otherwise (CI, agents, pipes) JSON. */
  interactive: boolean;
  fetch?: typeof fetch;
  /** Reads a line from the user (login). Absent when not interactive. */
  prompt?: (question: string) => Promise<string>;
  /** Override the config file location (tests). */
  configFile?: string;
  /** Delay between status polls in `emails watch` (tests). */
  pollMs?: number;
  /** Raw streams for `iemails mcp` (stdio transport). */
  stdin?: NodeJS.ReadableStream;
  stdout?: NodeJS.WritableStream;
}

class UsageError extends Error {}

const HELP = `iemails ${VERSION} — send email and manage iemails from your terminal

Usage: iemails <command> [options]

Account
  login [--key em_…] [--profile name]   Save an API key (validated first)
  logout [--profile name]               Forget a saved key
  whoami                                Show which key and account are in use
  profiles [use <name>]                 List profiles, or switch the default
  doctor                                Check the CLI, your key and your domains

Email
  send --from --to --subject (--text | --html | --html-file | --template)
                                        Send an email
  emails list [--status --q --limit]    Recent emails
  emails get <id>                       One email and its delivery events
  emails watch <id>                     Follow an email until it is delivered or fails
  emails cancel <id>                    Cancel a scheduled email

Domains, audience, webhooks
  domains list | add <name> | get <id> | verify <id> | remove <id>
  contacts list [--q] | add <email> [--first-name --last-name] | remove <id|email>
  broadcasts list | send <id> [--scheduled-at] --yes
  templates list
  webhooks list | create --url <https://…> --events a,b | remove <id>

AI agents
  mcp [--from <sender>] [--url <server>]
                                        Run a local MCP server over stdio for MCP clients
                                        (uses your key; forwards to the hosted iemails MCP server)

Anything else
  api <METHOD> <path> [--data '{…}' | --data @file.json]

Global options
  --json              JSON output (default when not in a terminal, e.g. CI or an agent)
  --api-key <key>     Use this key (otherwise IEMAILS_API_KEY, then the saved profile)
  --profile <name>    Use a saved profile
  --base-url <url>    API URL (otherwise IEMAILS_BASE_URL, default https://api.iemails.co)
  -h, --help          Help
  -v, --version       Version

Examples
  iemails login
  iemails send --from "Acme <hello@acme.dev>" --to you@example.com --subject Hi --text "It works"
  iemails send --from hello@acme.dev --to a@x.io,b@x.io --subject Invoice --html-file invoice.html --attach invoice.pdf
  iemails domains add mail.acme.dev
  IEMAILS_API_KEY=em_… iemails emails list --status bounced --json
`;

const OPTIONS = {
  json: { type: 'boolean' },
  'api-key': { type: 'string' },
  profile: { type: 'string' },
  'base-url': { type: 'string' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
  yes: { type: 'boolean', short: 'y' },
  key: { type: 'string' },
  // send
  from: { type: 'string' },
  to: { type: 'string', multiple: true },
  cc: { type: 'string', multiple: true },
  bcc: { type: 'string', multiple: true },
  'reply-to': { type: 'string', multiple: true },
  subject: { type: 'string', short: 's' },
  text: { type: 'string' },
  html: { type: 'string' },
  'html-file': { type: 'string' },
  'text-file': { type: 'string' },
  template: { type: 'string' },
  var: { type: 'string', multiple: true },
  tag: { type: 'string', multiple: true },
  header: { type: 'string', multiple: true },
  attach: { type: 'string', multiple: true },
  'scheduled-at': { type: 'string' },
  'idempotency-key': { type: 'string' },
  // lists and resources
  status: { type: 'string' },
  q: { type: 'string' },
  limit: { type: 'string' },
  cursor: { type: 'string' },
  'first-name': { type: 'string' },
  'last-name': { type: 'string' },
  url: { type: 'string' },
  events: { type: 'string' },
  description: { type: 'string' },
  data: { type: 'string' },
  interval: { type: 'string' },
} as const;

type Flags = ReturnType<typeof parseArgs<{ options: typeof OPTIONS; allowPositionals: true; strict: true }>>['values'];

const list = (values?: string[]) => (values ?? []).flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean);
const pairs = (values: string[] | undefined, what: string) =>
  Object.fromEntries(
    (values ?? []).map((v) => {
      const i = v.indexOf('=');
      if (i < 1) throw new UsageError(`${what} must look like name=value, got "${v}"`);
      return [v.slice(0, i), v.slice(i + 1)];
    }),
  );

function need<T>(value: T | undefined, message: string): T {
  if (value === undefined || value === '' || (Array.isArray(value) && !value.length)) throw new UsageError(message);
  return value;
}

/** Runs the CLI. Returns the exit code: 0 ok, 1 API or network error, 2 usage error. */
export async function run(argv: string[], ctx: RunContext): Promise<number> {
  const { io } = ctx;
  let flags: Flags;
  let positionals: string[];
  try {
    ({ values: flags, positionals } = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true }));
  } catch (e) {
    io.err(red(io, (e as Error).message));
    io.err(dim(io, 'Run iemails --help for usage.'));
    return 2;
  }

  if (flags.version) { io.out(VERSION); return 0; }
  const [command, ...rest] = positionals;
  if (flags.help || !command || command === 'help') { io.out(HELP); return command || flags.help ? 0 : 2; }

  const json = Boolean(flags.json) || !ctx.interactive;
  const cfgPath = ctx.configFile ?? configPath(ctx.env);
  const config = readConfig(cfgPath);
  const profileName = flags.profile ?? config.current;
  const profile = config.profiles[profileName];

  const keySource = flags['api-key'] ? '--api-key' : ctx.env.IEMAILS_API_KEY ? 'IEMAILS_API_KEY' : profile ? `profile "${profileName}"` : null;
  const apiKey = flags['api-key'] ?? ctx.env.IEMAILS_API_KEY ?? profile?.apiKey;
  const baseUrl = flags['base-url'] ?? ctx.env.IEMAILS_BASE_URL ?? profile?.baseUrl;
  const client = (key = apiKey, url = baseUrl) =>
    new IEmails(key ?? '', { ...(url ? { baseUrl: url } : {}), ...(ctx.fetch ? { fetch: ctx.fetch } : {}), headers: { 'user-agent': `iemails-cli/${VERSION} iemails-node/${VERSION}` } });

  /** Prints a result: JSON for machines, `human()` for people. Returns the exit code. */
  const show = <T>(res: Response<T>, human: (data: T) => string): number => {
    if (res.error) {
      if (json) io.out(JSON.stringify({ error: res.error }, null, 2));
      else {
        io.err(`${red(io, 'Error')} ${res.error.code}: ${res.error.message}`);
        for (const d of res.error.details ?? []) io.err(dim(io, `  ${d.path}: ${d.message}`));
        if (res.error.code === 'MISSING_API_KEY') io.err(dim(io, 'Run iemails login, or set IEMAILS_API_KEY.'));
        if (res.error.requestId) io.err(dim(io, `Request ${res.error.requestId}`));
      }
      return 1;
    }
    io.out(json ? JSON.stringify(res.data, null, 2) : human(res.data));
    return 0;
  };

  try {
    switch (command) {
      /* ----------------------------------------------------------- account */
      case 'login': {
        let key = flags.key ?? flags['api-key'];
        if (!key && ctx.prompt) key = (await ctx.prompt('API key (from Dashboard → API keys): ')).trim();
        key = need(key, 'Pass the key with --key em_…, or run iemails login in a terminal.');
        const check = await client(key).domains.list();
        if (check.error) return show(check, () => '');
        const name = flags.profile ?? (Object.keys(config.profiles).length ? config.current : 'default');
        const next: ConfigFile = { current: name, profiles: { ...config.profiles, [name]: { apiKey: key, ...(baseUrl ? { baseUrl } : {}) } } };
        writeConfig(cfgPath, next);
        if (json) io.out(JSON.stringify({ profile: name, key: maskKey(key), config: cfgPath }, null, 2));
        else io.out(`${green(io, '✓')} Saved ${maskKey(key)} as profile ${bold(io, name)} in ${cfgPath}`);
        return 0;
      }
      case 'logout': {
        if (!config.profiles[profileName]) throw new UsageError(`No saved profile "${profileName}".`);
        const profiles = { ...config.profiles };
        delete profiles[profileName];
        writeConfig(cfgPath, { current: Object.keys(profiles)[0] ?? 'default', profiles });
        io.out(json ? JSON.stringify({ removed: profileName }) : `${green(io, '✓')} Removed profile ${bold(io, profileName)}`);
        return 0;
      }
      case 'profiles': {
        if (rest[0] === 'use') {
          const name = need(rest[1], 'Usage: iemails profiles use <name>');
          if (!config.profiles[name]) throw new UsageError(`No saved profile "${name}".`);
          writeConfig(cfgPath, { ...config, current: name });
          io.out(json ? JSON.stringify({ current: name }) : `${green(io, '✓')} Now using ${bold(io, name)}`);
          return 0;
        }
        const rows = Object.entries(config.profiles).map(([n, p]) => ({ name: n, current: n === config.current, key: maskKey(p.apiKey), base_url: p.baseUrl ?? null }));
        io.out(json ? JSON.stringify(rows, null, 2) : table(io, ['', 'PROFILE', 'KEY'], rows.map((r) => [r.current ? green(io, '●') : ' ', r.name, r.key])));
        return 0;
      }
      case 'whoami': {
        const res = await client().domains.list();
        const info = { key: apiKey ? maskKey(apiKey) : null, source: keySource, base_url: baseUrl ?? 'https://api.iemails.co', valid: !res.error, domains: res.data?.data.length ?? null };
        if (res.error && res.error.code !== 'UNAUTHORIZED') return show(res, () => '');
        if (json) io.out(JSON.stringify(info, null, 2));
        else io.out([`Key      ${info.key ?? dim(io, 'none')} ${info.source ? dim(io, `(${info.source})`) : ''}`, `API      ${info.base_url}`, `Status   ${info.valid ? green(io, 'valid') : red(io, 'invalid key')}`, info.valid ? `Domains  ${info.domains}` : ''].filter(Boolean).join('\n'));
        return info.valid ? 0 : 1;
      }
      case 'doctor': {
        const checks: { check: string; ok: boolean; detail: string }[] = [];
        const major = Number(process.versions.node.split('.')[0]);
        checks.push({ check: 'Node.js', ok: major >= 20, detail: `v${process.versions.node}${major >= 20 ? '' : ' (needs 20+)'}` });
        checks.push({ check: 'CLI', ok: true, detail: `iemails ${VERSION}` });
        checks.push({ check: 'API key', ok: Boolean(apiKey), detail: apiKey ? `${maskKey(apiKey)} from ${keySource}` : 'none — run iemails login' });
        if (apiKey) {
          const res = await client().domains.list();
          checks.push({ check: 'API access', ok: !res.error, detail: res.error ? `${res.error.code}: ${res.error.message}` : `reached ${baseUrl ?? 'https://api.iemails.co'}` });
          for (const d of res.data?.data ?? []) checks.push({ check: `Domain ${d.name}`, ok: d.status === 'verified', detail: d.status === 'verified' ? 'verified' : `${d.status} — run iemails domains verify ${d.id}` });
          if (res.data && !res.data.data.length) checks.push({ check: 'Domains', ok: false, detail: 'none yet — run iemails domains add <domain>' });
        }
        if (json) io.out(JSON.stringify({ ok: checks.every((c) => c.ok), checks }, null, 2));
        else io.out(checks.map((c) => `${c.ok ? green(io, '✓') : red(io, '✗')} ${c.check.padEnd(22)} ${dim(io, c.detail)}`).join('\n'));
        return checks.every((c) => c.ok) ? 0 : 1;
      }

      /* ------------------------------------------------------------- email */
      case 'send': {
        const html = flags.html ?? (flags['html-file'] ? readFileSync(flags['html-file'], 'utf8') : undefined);
        const text = flags.text ?? (flags['text-file'] ? readFileSync(flags['text-file'], 'utf8') : undefined);
        if (!html && !text && !flags.template) throw new UsageError('Give a body: --text, --html, --html-file, --text-file or --template.');
        const res = await client().emails.send(
          {
            from: need(flags.from ?? ctx.env.IEMAILS_FROM, '--from is required (or set IEMAILS_FROM).'),
            to: need(list(flags.to), '--to is required.'),
            ...(flags.cc ? { cc: list(flags.cc) } : {}),
            ...(flags.bcc ? { bcc: list(flags.bcc) } : {}),
            ...(flags['reply-to'] ? { replyTo: list(flags['reply-to']) } : {}),
            ...(flags.subject !== undefined ? { subject: flags.subject } : {}),
            ...(html !== undefined ? { html } : {}),
            ...(text !== undefined ? { text } : {}),
            ...(flags.template ? { template: flags.template, variables: pairs(flags.var, '--var') } : {}),
            ...(flags.tag ? { tags: Object.entries(pairs(flags.tag, '--tag')).map(([name, value]) => ({ name, value })) } : {}),
            ...(flags.header ? { headers: pairs(flags.header, '--header') } : {}),
            ...(flags.attach ? { attachments: flags.attach.map((p) => ({ filename: basename(p), content: new Uint8Array(readFileSync(p)) })) } : {}),
            ...(flags['scheduled-at'] ? { scheduledAt: flags['scheduled-at'] } : {}),
          },
          flags['idempotency-key'] ? { idempotencyKey: flags['idempotency-key'] } : {},
        );
        return show(res, (d) => `${green(io, '✓')} ${d.status === 'scheduled' ? `Scheduled for ${when(d.scheduled_at)}` : 'Queued'} ${bold(io, d.id)}\n${dim(io, `Follow it: iemails emails watch ${d.id}`)}`);
      }
      case 'emails': {
        const sub = rest[0] ?? 'list';
        if (sub === 'list') {
          const res = await client().emails.list({ ...(flags.status ? { status: flags.status } : {}), ...(flags.q ? { q: flags.q } : {}), ...(flags.limit ? { limit: Number(flags.limit) } : {}), ...(flags.cursor ? { cursor: flags.cursor } : {}) });
          return show(res, (d) => table(io, ['ID', 'STATUS', 'TO', 'SUBJECT', 'CREATED'], d.data.map((e) => [e.id, status(io, e.status), e.to.join(', '), e.subject ?? '', when(e.created_at)])) + (d.has_more ? dim(io, `\nMore: iemails emails list --cursor ${d.next_cursor}`) : ''));
        }
        const id = need(rest[1], `Usage: iemails emails ${sub} <id>`);
        if (sub === 'get') {
          return show(await client().emails.get(id), (e) =>
            [`${bold(io, e.subject ?? '(no subject)')}  ${status(io, e.status)}`, `From     ${e.from}`, `To       ${e.to.join(', ')}`, `Created  ${when(e.created_at)}`, '', table(io, ['EVENT', 'RECIPIENT', 'AT'], (e.events ?? []).map((ev) => [status(io, ev.type), ev.recipient ?? '', when(ev.occurred_at)]))].join('\n'));
        }
        if (sub === 'cancel') return show(await client().emails.cancel(id), (d) => `${green(io, '✓')} Cancelled ${d.id}`);
        if (sub === 'watch') {
          const final = new Set(['delivered', 'bounced', 'failed', 'complained', 'cancelled', 'simulated']);
          const pause = ctx.pollMs ?? Math.max(1, Number(flags.interval ?? 2)) * 1000;
          const seen = new Set<string>();
          for (let i = 0; i < 150; i++) {
            const res = await client().emails.get(id);
            if (res.error) return show(res, () => '');
            for (const ev of res.data.events ?? []) {
              if (seen.has(ev.id)) continue;
              seen.add(ev.id);
              io.out(json ? JSON.stringify(ev) : `${dim(io, when(ev.occurred_at))}  ${status(io, ev.type)}${ev.recipient ? dim(io, `  ${ev.recipient}`) : ''}`);
            }
            if (final.has(res.data.status)) return ['delivered', 'simulated'].includes(res.data.status) ? 0 : 1;
            await new Promise((r) => setTimeout(r, pause));
          }
          io.err(yellow(io, 'Still not final after 150 checks; stopping.'));
          return 1;
        }
        throw new UsageError(`Unknown command: emails ${sub}`);
      }

      /* ------------------------------------------------- other resources */
      case 'domains': {
        const sub = rest[0] ?? 'list';
        if (sub === 'list') return show(await client().domains.list(), (d) => table(io, ['ID', 'DOMAIN', 'STATUS'], d.data.map((x) => [x.id, x.name, status(io, x.status)])));
        const arg = need(rest[1], `Usage: iemails domains ${sub} <${sub === 'add' ? 'name' : 'id'}>`);
        const records = (d: { name: string; status: string; records?: { record?: string; name: string; value: string; status?: string; required?: boolean }[] }) =>
          `${bold(io, d.name)}  ${status(io, d.status)}\n\n${table(io, ['TYPE', 'NAME', 'VALUE', 'STATUS'], (d.records ?? []).map((r) => [r.record ?? '', r.name, r.value.length > 60 ? `${r.value.slice(0, 57)}…` : r.value, status(io, r.status ?? 'pending')]))}\n${dim(io, 'Add these at your DNS provider, then run iemails domains verify <id>. Use --json for full values.')}`;
        if (sub === 'add') return show(await client().domains.create({ name: arg }), records);
        if (sub === 'get') return show(await client().domains.get(arg), records);
        if (sub === 'verify') return show(await client().domains.verify(arg), records);
        if (sub === 'remove') return show(await client().domains.remove(arg), (d) => `${green(io, '✓')} Removed ${d.id}`);
        throw new UsageError(`Unknown command: domains ${sub}`);
      }
      case 'contacts': {
        const sub = rest[0] ?? 'list';
        if (sub === 'list') return show(await client().contacts.list({ ...(flags.q ? { q: flags.q } : {}), ...(flags.limit ? { limit: Number(flags.limit) } : {}), ...(flags.cursor ? { cursor: flags.cursor } : {}) }), (d) => table(io, ['EMAIL', 'NAME', 'SUBSCRIBED'], d.data.map((c) => [c.email, [c.first_name, c.last_name].filter(Boolean).join(' '), c.subscribed ? 'yes' : 'no'])));
        const arg = need(rest[1], `Usage: iemails contacts ${sub} <email>`);
        if (sub === 'add') return show(await client().contacts.create({ email: arg, ...(flags['first-name'] ? { firstName: flags['first-name'] } : {}), ...(flags['last-name'] ? { lastName: flags['last-name'] } : {}) }), (c) => `${green(io, '✓')} Added ${c.email ?? arg}`);
        if (sub === 'remove') return show(await client().contacts.remove(arg), () => `${green(io, '✓')} Removed ${arg}`);
        throw new UsageError(`Unknown command: contacts ${sub}`);
      }
      case 'broadcasts': {
        const sub = rest[0] ?? 'list';
        if (sub === 'list') return show(await client().broadcasts.list(flags.status ? { status: flags.status } : {}), (d) => table(io, ['ID', 'NAME', 'STATUS'], d.data.map((b) => [b.id, b.name, status(io, b.status)])));
        if (sub === 'send') {
          const id = need(rest[1], 'Usage: iemails broadcasts send <id> --yes');
          if (!flags.yes) throw new UsageError('This emails your whole audience. Add --yes to confirm.');
          return show(await client().broadcasts.send(id, flags['scheduled-at'] ? { scheduledAt: flags['scheduled-at'] } : {}), (b) => `${green(io, '✓')} ${b.id} ${status(io, String(b.status))}`);
        }
        throw new UsageError(`Unknown command: broadcasts ${sub}`);
      }
      case 'templates': {
        return show(await client().templates.list(), (d) => table(io, ['ID', 'SLUG', 'NAME'], d.data.map((t) => [t.id, t.slug, t.name])));
      }
      case 'webhooks': {
        const sub = rest[0] ?? 'list';
        if (sub === 'list') return show(await client().webhooks.list(), (d) => table(io, ['ID', 'URL', 'EVENTS'], d.data.map((w) => [w.id, w.url, (w.events ?? []).join(', ')])));
        if (sub === 'create') {
          const events = need(list([flags.events ?? '']), `--events is required, e.g. --events email.delivered,email.bounced. Known events: ${WEBHOOK_EVENT_TYPES.join(', ')}`);
          const res = await client().webhooks.create({ url: need(flags.url, '--url is required.'), events: events as WebhookEventType[], ...(flags.description ? { description: flags.description } : {}) });
          return show(res, (w) => `${green(io, '✓')} Created ${w.id}\nSigning secret ${bold(io, w.signing_secret)}\n${dim(io, 'Shown once. Store it, e.g. as IEMAILS_WEBHOOK_SECRET.')}`);
        }
        if (sub === 'remove') return show(await client().webhooks.remove(need(rest[1], 'Usage: iemails webhooks remove <id>')), (d) => `${green(io, '✓')} Removed ${d.id}`);
        throw new UsageError(`Unknown command: webhooks ${sub}`);
      }
      case 'mcp': {
        if (!apiKey) {
          io.err('iemails mcp: no API key. Set IEMAILS_API_KEY in the MCP client config, or run iemails login.');
          return 1;
        }
        if (!ctx.stdin || !ctx.stdout) throw new Error('iemails mcp needs stdin and stdout');
        const from = flags.from ?? ctx.env.IEMAILS_FROM;
        return runMcpBridge({
          apiKey,
          url: flags.url ?? ctx.env.IEMAILS_MCP_URL ?? DEFAULT_MCP_URL,
          ...(from ? { from } : {}),
          input: ctx.stdin as import('node:stream').Readable,
          output: ctx.stdout as import('node:stream').Writable,
          log: io.err,
          ...(ctx.fetch ? { fetch: ctx.fetch } : {}),
        });
      }
      case 'api': {
        const method = need(rest[0], 'Usage: iemails api <METHOD> <path> [--data …]').toUpperCase();
        if (!['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) throw new UsageError(`Unknown method ${method}`);
        const path = need(rest[1], 'Usage: iemails api <METHOD> <path> [--data …]');
        const raw = flags.data?.startsWith('@') ? readFileSync(flags.data.slice(1), 'utf8') : flags.data;
        let body: unknown;
        try { body = raw ? JSON.parse(raw) : undefined; } catch { throw new UsageError('--data must be JSON (or @file.json).'); }
        const res = await client().request(method as 'GET', path, body);
        if (res.error) return show(res, () => '');
        io.out(JSON.stringify(res.data, null, 2));
        return 0;
      }
      default:
        throw new UsageError(`Unknown command: ${command}`);
    }
  } catch (e) {
    if (e instanceof UsageError) {
      io.err(red(io, e.message));
      io.err(dim(io, 'Run iemails --help for usage.'));
      return 2;
    }
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') { io.err(red(io, `File not found: ${err.path}`)); return 2; }
    throw e;
  }
}
