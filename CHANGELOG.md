# Changelog

## 0.1.0 — unreleased

First release.

- `IEmails` client with `{ data, error }` results, retries with backoff and automatic idempotency keys for sends.
- Resources: emails, batch, domains, contacts, broadcasts, templates, webhooks, inbound, inboxes (threads, labels, drafts) and events.
- `verifyWebhook` for `webhook-id` / `webhook-timestamp` / `webhook-signature` (HMAC-SHA256, Web Crypto).
- `request()` for endpoints not wrapped yet.
