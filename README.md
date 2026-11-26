# iemails Node.js SDK

The official Node.js library for the [iemails](https://iemails.co) API: send transactional email, and manage domains, contacts, broadcasts, templates, webhooks and inboxes.

- Zero dependencies — uses `fetch`, so it runs on Node 18+, Bun, Deno, Vercel/Netlify edge and Supabase edge functions.
- Every method returns `{ data, error }` and never throws for API errors.
- Safe retries: rate limits and network errors are retried, and sends carry an idempotency key so a retry can't send twice.
- Fully typed, ESM and CommonJS.

## Install

```bash
npm install iemails
# or
pnpm add iemails
yarn add iemails
bun add iemails
```

## Setup

Create an API key in **Dashboard → API keys**, then:

```ts
import { IEmails } from 'iemails';

const iemails = new IEmails(process.env.IEMAILS_API_KEY);
```

With no argument, the client reads `IEMAILS_API_KEY` from the environment.

> Keep the key on the server. Never use it in browser code.

## Send an email

```ts
const { data, error } = await iemails.emails.send({
  from: 'Acme <hello@acme.dev>',
  to: ['sam@example.com'],
  subject: 'Welcome to Acme',
  html: '<p>Hi Sam, thanks for signing up.</p>',
});

if (error) {
  console.error(error.code, error.message);
} else {
  console.log(data.id); // em_7Hk2Qp9vX
}
```

`from` must be on a domain you have verified in iemails. Until then, you can send from `onboarding@iemails.co` to people on your team.

### More options

```ts
await iemails.emails.send({
  from: 'Acme <billing@acme.dev>',
  to: 'sam@example.com',
  cc: 'finance@example.com',
  replyTo: 'support@acme.dev',
  subject: 'Your invoice',
  text: 'Your invoice is attached.',
  attachments: [{ filename: 'invoice.pdf', content: pdfBytes }], // Uint8Array, ArrayBuffer or base64
  tags: [{ name: 'category', value: 'invoice' }],
  headers: { 'X-Entity-Ref-ID': 'inv_1042' },
  scheduledAt: new Date(Date.now() + 60 * 60 * 1000), // send in an hour
});
```

### Send with a template

```ts
await iemails.emails.send({
  from: 'Acme <hello@acme.dev>',
  to: 'sam@example.com',
  template: 'welcome',            // the template's slug
  variables: { firstName: 'Sam' },
});
```

### Batch send (up to 100)

```ts
const { data } = await iemails.batch.send([
  { from: 'hello@acme.dev', to: 'a@example.com', subject: 'Hi A', text: '…' },
  { from: 'hello@acme.dev', to: 'b@example.com', subject: 'Hi B', text: '…' },
]);
// data.data → one { index, id } or { index, error } per email
```

### Follow, reschedule and cancel

```ts
const { data: email } = await iemails.emails.get('em_7Hk2Qp9vX'); // with delivery events
await iemails.emails.update('em_7Hk2Qp9vX', { scheduledAt: '2026-12-01T09:00:00Z' });
await iemails.emails.cancel('em_7Hk2Qp9vX');
await iemails.emails.list({ status: 'bounced', limit: 50 });
```

## Errors

```ts
const { error } = await iemails.emails.send({ /* … */ });
if (error) {
  error.code;       // 'VALIDATION_ERROR' | 'DOMAIN_NOT_VERIFIED' | 'RATE_LIMITED' | …
  error.message;    // plain-language explanation
  error.statusCode; // HTTP status, or null if no response was received
  error.details;    // field-level problems for validation errors
  error.requestId;  // find this request in iemails Logs
}
```

## Idempotency and retries

Sends get an automatic idempotency key, so when the client retries after a timeout or a dropped connection, the email is sent once. Pass your own to make retries safe across processes:

```ts
await iemails.emails.send(email, { idempotencyKey: `welcome-${user.id}` });
```

The client retries `429`, `5xx` and network errors up to 2 times with backoff (honouring `Retry-After`). Configure it:

```ts
const iemails = new IEmails(key, { maxRetries: 3, timeout: 10_000 });
```

Every method also takes `{ signal, headers }`:

```ts
await iemails.emails.list({}, { signal: AbortSignal.timeout(5000) });
```

## Webhooks

Verify a webhook before trusting it. Pass the **raw** body.

```ts
import { verifyWebhook } from 'iemails';

// Next.js route handler
export async function POST(req: Request) {
  const payload = await req.text();
  try {
    const event = await verifyWebhook({ payload, headers: req.headers, secret: process.env.IEMAILS_WEBHOOK_SECRET! });
    if (event.type === 'email.bounced') {
      // …
    }
    return new Response('ok');
  } catch {
    return new Response('invalid signature', { status: 400 });
  }
}
```

Manage endpoints:

```ts
const { data } = await iemails.webhooks.create({ url: 'https://acme.dev/hooks/email', events: ['email.bounced', 'email.complained'] });
data.signing_secret; // shown once — store it
```

## Everything else

```ts
// Domains
await iemails.domains.create({ name: 'mail.acme.dev' }); // returns the DNS records to add
await iemails.domains.verify('dom_123');

// Contacts
await iemails.contacts.create({ email: 'sam@example.com', firstName: 'Sam' });
await iemails.contacts.update('sam@example.com', { subscribed: false });

// Broadcasts
const { data: bc } = await iemails.broadcasts.create({ name: 'November update', subject: 'What’s new', html, segmentId: 'seg_1', from: 'news@acme.dev' });
await iemails.broadcasts.send(bc!.id, { scheduledAt: '2026-12-01T09:00:00Z' });

// Templates
await iemails.templates.create({ name: 'Welcome', subject: 'Welcome, {{firstName}}', html });
await iemails.templates.publish('welcome');

// Inbound mail and inboxes
await iemails.inbound.list();
const { data: threads } = await iemails.inboxes.threads.list('ibx_1', { folders: ['inbox'], read: false });
await iemails.inboxes.threads.reply('ibx_1', 'th_1', 'em_9', { text: 'Thanks — on it.' });

// Product events (for automations)
await iemails.events.track({ name: 'trial_started', email: 'sam@example.com' });
```

Anything not wrapped yet:

```ts
const { data } = await iemails.request('GET', '/smtp/verify');
```

## Configuration

| Option | Default | |
|---|---|---|
| `baseUrl` | `https://api.iemails.co` (or `IEMAILS_BASE_URL`) | API URL |
| `maxRetries` | `2` | Retries for 429, 5xx and network errors |
| `timeout` | `30000` | Per-attempt timeout in ms |
| `fetch` | global `fetch` | Custom fetch (proxies, tests) |
| `headers` | `{}` | Sent with every request |

## License

MIT
