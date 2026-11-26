import { describe, expect, it } from 'vitest';
import { json, mockClient } from './helpers';

describe('emails', () => {
  it('send converts camelCase to the snake_case wire format and keeps user maps intact', async () => {
    const { client, calls } = mockClient([json({ object: 'email', id: 'em_1', status: 'scheduled', scheduled_at: '2026-12-01T09:00:00.000Z' })]);
    await client.emails.send({
      from: 'Acme <hello@acme.dev>',
      to: ['sam@example.com'],
      replyTo: 'support@acme.dev',
      subject: 'Welcome',
      html: '<p>Hi</p>',
      scheduledAt: new Date('2026-12-01T09:00:00Z'),
      headers: { 'X-Campaign': 'onboarding' },
      variables: { firstName: 'Sam' },
      attachments: [{ filename: 'a.txt', content: new TextEncoder().encode('hello'), contentType: 'text/plain' }],
    });
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toBe('https://api.iemails.co/emails');
    expect(calls[0]!.body).toEqual({
      from: 'Acme <hello@acme.dev>',
      to: ['sam@example.com'],
      reply_to: 'support@acme.dev',
      subject: 'Welcome',
      html: '<p>Hi</p>',
      scheduled_at: '2026-12-01T09:00:00.000Z',
      headers: { 'X-Campaign': 'onboarding' },
      variables: { firstName: 'Sam' },
      attachments: [{ filename: 'a.txt', content: 'aGVsbG8=', content_type: 'text/plain' }],
    });
  });

  it('uses the caller’s idempotency key', async () => {
    const { client, calls } = mockClient([json({ object: 'email', id: 'em_1' })]);
    await client.emails.send({ from: 'a@acme.dev', to: 'b@x.io', text: 'x' }, { idempotencyKey: 'order-42' });
    expect(calls[0]!.headers['idempotency-key']).toBe('order-42');
  });

  it('list builds a query string', async () => {
    const { client, calls } = mockClient([json({ object: 'list', data: [] })]);
    await client.emails.list({ status: 'bounced', q: 'jo@x.io', limit: 10 });
    expect(calls[0]!.url).toBe('https://api.iemails.co/emails?status=bounced&q=jo%40x.io&limit=10');
  });

  it('update, cancel and resend hit the right paths', async () => {
    const { client, calls } = mockClient([json({}), json({}), json({})]);
    await client.emails.update('em_1', { scheduledAt: '2026-12-02T10:00:00Z' });
    await client.emails.cancel('em_1');
    await client.emails.resend('em_1', { to: 'new@x.io' });
    expect(calls.map((c) => `${c.method} ${c.url.replace('https://api.iemails.co', '')}`)).toEqual(['PATCH /emails/em_1', 'POST /emails/em_1/cancel', 'POST /emails/em_1/resend']);
    expect(calls[0]!.body).toEqual({ scheduled_at: '2026-12-02T10:00:00Z' });
  });
});

describe('batch', () => {
  it('wraps emails and reports a partial (207) result as data', async () => {
    const { client, calls } = mockClient([json({ object: 'batch', queued: 1, failed: 1, data: [{ index: 0, id: 'em_1', status: 'queued' }, { index: 1, error: { code: 'VALIDATION_ERROR', message: 'bad' } }] }, 207)]);
    const { data, error } = await client.batch.send([
      { from: 'a@acme.dev', to: 'b@x.io', subject: 'One', text: '1' },
      { from: 'a@acme.dev', to: 'nope', subject: 'Two', text: '2', replyTo: 'r@acme.dev' },
    ]);
    expect(error).toBeNull();
    expect(data?.failed).toBe(1);
    expect(calls[0]!.url).toBe('https://api.iemails.co/emails/batch');
    expect(calls[0]!.body.emails[1].reply_to).toBe('r@acme.dev');
  });
});

describe('other resources', () => {
  it('map to the API routes', async () => {
    const { client, calls } = mockClient(Array.from({ length: 14 }, () => json({})));
    await client.domains.create({ name: 'mail.acme.dev' });
    await client.domains.verify('dom_1');
    await client.contacts.create({ email: 'sam@x.io', firstName: 'Sam' });
    await client.contacts.get('sam@x.io');
    await client.broadcasts.send('bc_1', { scheduledAt: '2026-12-01T09:00:00Z' });
    await client.templates.get('welcome', { version: 'draft' });
    await client.webhooks.create({ url: 'https://acme.dev/hooks', events: ['email.bounced'] });
    await client.inbound.list({ cursor: 'c1' });
    await client.inboxes.threads.list('ibx_1', { folders: ['inbox', 'sent'], read: false });
    await client.inboxes.threads.reply('ibx_1', 'th_1', 'em_9', { text: 'Thanks!' });
    await client.inboxes.threads.setLabels('ibx_1', 'th_1', ['lbl_1']);
    await client.inboxes.drafts.create('ibx_1', { to: 'x@y.z', threadId: 'th_1', replyToEmailId: 'em_9' });
    await client.inboxes.labels.remove('ibx_1', 'lbl_1');
    await client.events.track({ name: 'trial_started', email: 'sam@x.io', occurredAt: new Date('2026-11-01T00:00:00Z') });

    expect(calls.map((c) => `${c.method} ${c.url.replace('https://api.iemails.co', '')}`)).toEqual([
      'POST /domains',
      'POST /domains/dom_1/verify',
      'POST /contacts',
      'GET /contacts/sam%40x.io',
      'POST /broadcasts/bc_1/send',
      'GET /templates/welcome?version=draft',
      'POST /webhooks',
      'GET /inbound?cursor=c1',
      'GET /inboxes/ibx_1/threads?folders=inbox%2Csent&read=false',
      'POST /inboxes/ibx_1/threads/th_1/emails/em_9/reply',
      'PUT /inboxes/ibx_1/threads/th_1/labels',
      'POST /inboxes/ibx_1/drafts',
      'DELETE /inboxes/ibx_1/labels/lbl_1',
      'POST /events',
    ]);
    expect(calls[2]!.body).toEqual({ email: 'sam@x.io', first_name: 'Sam' });
    expect(calls[11]!.body).toEqual({ to: 'x@y.z', thread_id: 'th_1', reply_to_email_id: 'em_9' });
    expect(calls[13]!.body).toEqual({ name: 'trial_started', email: 'sam@x.io', occurred_at: '2026-11-01T00:00:00.000Z' });
  });
});
