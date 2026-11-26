# Changelog

## 0.1.1 — 2026-11-26

- Published from GitHub Actions with npm trusted publishing, so each release carries a provenance statement linking it to this repository.
- No API changes.

## 0.1.0 — 2026-11-26

First release.

- `IEmails` client with `{ data, error }` results, retries with backoff and automatic idempotency keys for sends.
- Resources: emails, batch, domains, contacts, broadcasts, templates, webhooks, inbound, inboxes (threads, labels, drafts) and events.
- `verifyWebhook` for `webhook-id` / `webhook-timestamp` / `webhook-signature` (HMAC-SHA256, Web Crypto).
- `request()` for endpoints not wrapped yet.
