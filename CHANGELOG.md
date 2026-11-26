# Changelog

## 0.2.0 — 2026-11-26

- New `iemails` command-line tool, installed with the package (`npx iemails`, or `npm i -g iemails`):
  `login`/`logout`/`profiles`/`whoami`/`doctor`, `send` (with files, attachments, templates and tags),
  `emails list|get|watch|cancel`, `domains`, `contacts`, `broadcasts`, `templates`, `webhooks` and a raw `api` command.
  Human-readable output in a terminal, JSON in CI and for agents (or with `--json`).
- `iemails mcp`: a local MCP server over stdio for MCP clients that prefer a command to a URL. It forwards to the
  hosted iemails MCP server with your API key (from `IEMAILS_API_KEY` or `iemails login`).
- Agent Skill: `skills/iemails/SKILL.md` teaches coding agents to use iemails correctly
  (`npx skills add Linkkit-Space/iemails-sdk`).
- Claude Code plugin: this repo is also a plugin marketplace bundling the MCP server and the skill
  (`/plugin install iemails --marketplace Linkkit-Space/iemails-sdk`).
- `DnsRecord` now matches the API: `record` (TXT/MX/CNAME), `priority`, `required`, `last_checked_at`.
- A `User-Agent` passed in `headers` is no longer overwritten.

## 0.1.1 — 2026-11-26

- Published from GitHub Actions with npm trusted publishing, so each release carries a provenance statement linking it to this repository.
- Requires Node.js 20 or newer (Node 18 is end-of-life and has no global Web Crypto, which `verifyWebhook` needs).
- No API changes.

## 0.1.0 — 2026-11-26

First release.

- `IEmails` client with `{ data, error }` results, retries with backoff and automatic idempotency keys for sends.
- Resources: emails, batch, domains, contacts, broadcasts, templates, webhooks, inbound, inboxes (threads, labels, drafts) and events.
- `verifyWebhook` for `webhook-id` / `webhook-timestamp` / `webhook-signature` (HMAC-SHA256, Web Crypto).
- `request()` for endpoints not wrapped yet.
