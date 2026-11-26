---
name: iemails
description: Send and manage email with iemails (iemails.co) — the Node.js SDK (npm "iemails"), the REST API, the `iemails` CLI and the iemails MCP tools. Use when adding transactional email (sign-up, password reset, receipts, notifications) to an app, sending a test email, checking delivery, verifying a sending domain, handling iemails webhooks, or when the user mentions iemails.
---

# iemails

iemails sends transactional and marketing email through one API (base URL `https://api.iemails.co`) or SMTP, from the user's own verified domain. Every request authenticates with an API key (`em_…`) as `Authorization: Bearer <key>`.

## Choosing how to integrate

| Situation | Use |
|---|---|
| App code in Node.js, Bun, Deno, Next.js, edge or Supabase functions | The SDK: `npm install iemails` (in Deno/Supabase: `import { IEmails } from 'npm:iemails'`) |
| Any other language | The REST API with `fetch`/HTTP (examples below) |
| A shell, script or CI job | The CLI: `npx iemails …` |
| You (the agent) acting on the user's account right now | The iemails MCP tools (`send_email`, `get_email`, `list_domains`, …) if they are connected |
| An app or framework that only speaks SMTP | Host `smtp.iemails.co`, port `465` (SSL/TLS), username `iemails`, password = API key |

## Rules that matter

1. **The API key is a server-side secret.** Read it from `process.env.IEMAILS_API_KEY` (or the platform's secret store). Never put it in client/browser code, a mobile app, a `NEXT_PUBLIC_`/`VITE_` variable, or a committed file. If you write a `.env` example, use a placeholder.
2. **Send from server code only**: an API route, server action, background job or edge function.
3. **`from` must be on a domain verified in iemails** (e.g. `Acme <hello@updates.acme.com>`). Before the domain is verified, `onboarding@iemails.co` can send, but only to the workspace's members and audience contacts. Ask the user for their sending address instead of inventing one.
4. **Check the result.** SDK methods never throw for API errors; they return `{ data, error }`. Handle `error` (log `error.code`, `error.message`, `error.requestId`).
5. **Make retries safe.** For sends triggered by an event (sign-up, order), pass an idempotency key derived from it, e.g. `welcome/${user.id}` or `order-confirmation/${order.id}`, so a retry never sends twice.
6. **Test without emailing real people**: send to `delivered@simulator.iemails.co` (or `bounce@simulator.iemails.co` to test bounces). Never test with made-up addresses like `test@example.com`; they bounce and hurt the sender's reputation.

## SDK (Node.js 20+, Bun, Deno, edge)

```ts
import { IEmails } from 'iemails';

const iemails = new IEmails(process.env.IEMAILS_API_KEY);

const { data, error } = await iemails.emails.send(
  {
    from: 'Acme <hello@updates.acme.com>',
    to: user.email,                // string or string[] (max 50 across to/cc/bcc)
    subject: 'Welcome to Acme',
    html: '<p>Hi there, thanks for signing up.</p>',
    text: 'Hi there, thanks for signing up.',
    // optional: cc, bcc, replyTo, headers, tags: [{ name, value }], metadata,
    // attachments: [{ filename, content /* Uint8Array | base64 */, contentType }],
    // scheduledAt: Date | ISO string (up to 30 days ahead),
    // template: 'welcome', variables: { firstName: 'Sam' }  (instead of html/text)
  },
  { idempotencyKey: `welcome/${user.id}` },
);
if (error) throw new Error(`iemails ${error.code}: ${error.message}`);
console.log(data.id); // email_…
```

Other calls: `iemails.batch.send([...])` (≤100 emails), `iemails.emails.get(id)` (status + events), `emails.list({ status, q, limit })`, `emails.update(id, { scheduledAt })`, `emails.cancel(id)`, `domains.create({ name })` / `domains.verify(id)`, `contacts.create({ email, firstName })`, `broadcasts.*`, `templates.*`, `webhooks.create({ url, events })`, `inboxes.threads.reply(...)`, and `iemails.request(method, path, body)` for anything else. The client retries 429/5xx/network errors and adds idempotency keys to sends automatically.

## REST API (any language)

```bash
curl -X POST https://api.iemails.co/emails \
  -H "Authorization: Bearer $IEMAILS_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: welcome/usr_2841" \
  -d '{"from":"Acme <hello@updates.acme.com>","to":["sam@example.com"],"subject":"Welcome","html":"<p>Hi</p>"}'
# → {"object":"email","id":"email_…","status":"queued","scheduled_at":null}
```

JSON fields are snake_case (`reply_to`, `scheduled_at`). Errors look like `{"error":{"code":"DOMAIN_NOT_VERIFIED","message":"…"}}`. Common codes: `VALIDATION_ERROR` (422, see `details`), `UNAUTHORIZED` (401), `DOMAIN_NOT_VERIFIED`/`SUPPRESSED_RECIPIENT`/`FORBIDDEN` (403), `RATE_LIMITED` (429, honour `Retry-After`). Lists paginate with `limit` (≤100) and `cursor` = the previous `next_cursor`. Limits: 600 requests/min per workspace, `POST /emails` 100/s, batch 10/s.

## Webhooks

Create an endpoint (`iemails.webhooks.create({ url, events: ['email.delivered', 'email.bounced'] })`); the `signing_secret` (`whsec_…`) is returned once. Verify every delivery against the **raw** body before trusting it:

```ts
import { verifyWebhook } from 'iemails';

export async function POST(req: Request) {
  const payload = await req.text(); // raw body — do not JSON.parse first
  try {
    const event = await verifyWebhook({ payload, headers: req.headers, secret: process.env.IEMAILS_WEBHOOK_SECRET! });
    // event.type: 'email.delivered' | 'email.bounced' | 'email.complained' | 'email.received' | …
    return new Response('ok');
  } catch {
    return new Response('invalid signature', { status: 400 });
  }
}
```

The scheme: header `webhook-signature` = `v1,` + hex HMAC-SHA256 of `${webhook-id}.${webhook-timestamp}.${rawBody}` with the full secret; reject timestamps older than 5 minutes.

## CLI

```bash
npx iemails login                       # or set IEMAILS_API_KEY
npx iemails send --from "Acme <hello@updates.acme.com>" --to you@example.com --subject Hi --text "It works"
npx iemails emails watch email_…         # exits 0 when delivered
npx iemails domains add mail.acme.com    # prints the DNS records to add
npx iemails doctor                       # key + domain status
```

Output is JSON when not in a terminal; exit codes: 0 ok, 1 API error, 2 usage error.

## MCP tools (when connected)

Prefer read-only tools (`list_domains`, `get_email`, `list_emails`, `get_domain`) to inspect before acting. `send_broadcast` and every `delete_*` tool email real people or delete data: confirm with the user first. After `send_email`, call `get_email` to report the delivery status. Setup for each client: https://iemails.co/ai/mcp

## Domains and deliverability

- Recommend a sending subdomain (`updates.acme.com`) so product email reputation stays separate.
- `domains.create` returns DNS records: DKIM (TXT `send._domainkey`), return-path (MX + SPF TXT on `send.`), DMARC (TXT `_dmarc`, recommended), optional tracking CNAME. Values must be copied exactly; many DNS providers append the domain to the name automatically.
- iemails re-checks DNS every 30 minutes for 14 days; `domains.verify(id)` checks now.
- Hard bounces, complaints and unsubscribes are suppressed automatically; sending to a suppressed address fails with `SUPPRESSED_RECIPIENT`.

Docs: https://iemails.co/docs/introduction · SDK and CLI source: https://github.com/Linkkit-Space/iemails-sdk
