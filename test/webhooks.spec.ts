import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { IEmails, verifyWebhook, WebhookVerificationError } from '../src';

const secret = 'whsec_test_secret';
const payload = JSON.stringify({ type: 'email.delivered', data: { id: 'em_1' } });

/** Signs exactly like the iemails server (src/server/services/webhooks.ts). */
function sign(id: string, timestamp: number, body: string, key = secret) {
  return `v1,${createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('hex')}`;
}

describe('verifyWebhook', () => {
  const now = Math.floor(Date.now() / 1000);
  const headers = { 'webhook-id': 'evt_1', 'webhook-timestamp': String(now), 'webhook-signature': sign('evt_1', now, payload) };

  it('accepts a valid signature and returns the parsed event', async () => {
    const event = await verifyWebhook({ payload, headers, secret });
    expect(event.type).toBe('email.delivered');
  });

  it('accepts a Headers object and the client method', async () => {
    const event = await new IEmails('em_x', { fetch: (() => {}) as never }).webhooks.verify({ payload, headers: new Headers(headers), secret });
    expect(event.type).toBe('email.delivered');
  });

  it('rejects a tampered body', async () => {
    await expect(verifyWebhook({ payload: payload.replace('em_1', 'em_2'), headers, secret })).rejects.toBeInstanceOf(WebhookVerificationError);
  });

  it('rejects the wrong secret', async () => {
    await expect(verifyWebhook({ payload, headers, secret: 'whsec_other' })).rejects.toThrow('does not match');
  });

  it('rejects an old timestamp', async () => {
    const old = now - 3600;
    await expect(
      verifyWebhook({ payload, secret, headers: { id: 'evt_1', timestamp: String(old), signature: sign('evt_1', old, payload) } }),
    ).rejects.toThrow('tolerance');
  });

  it('rejects missing headers', async () => {
    await expect(verifyWebhook({ payload, headers: {}, secret })).rejects.toThrow('Missing');
  });
});
