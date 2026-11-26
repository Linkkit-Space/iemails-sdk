import type { Requester } from '../common/requester';
import { toBase64 } from '../common/requester';
import { query, seg, toWire } from '../common/utils';
import type { List, RequestOptions, Response } from '../interfaces';
import type { Attachment, Email, ListEmailsOptions, SendEmailOptions, SendEmailResponse, UpdateEmailOptions } from './interfaces';

const attachments = (list: Attachment[]) =>
  list.map((a) => toWire({ filename: a.filename, content: toBase64(a.content), contentType: a.contentType }));

/** Request body for one email, as the API expects it. */
export const emailBody = (email: SendEmailOptions) => toWire(email, { attachments });

export class Emails {
  constructor(private readonly req: Requester) {}

  /**
   * Send one email now, or later with `scheduledAt`.
   *
   * ```ts
   * const { data, error } = await iemails.emails.send({
   *   from: 'Acme <hello@acme.dev>',
   *   to: 'sam@example.com',
   *   subject: 'Welcome',
   *   html: '<p>Hi Sam</p>',
   * });
   * ```
   */
  send(email: SendEmailOptions, options: RequestOptions = {}): Promise<Response<SendEmailResponse>> {
    return this.req('POST', '/emails', emailBody(email), { ...options, autoIdempotency: true });
  }

  /** Retrieve an email with its content and delivery events. */
  get(id: string, options: RequestOptions = {}): Promise<Response<Email>> {
    return this.req('GET', `/emails/${seg(id)}`, undefined, options);
  }

  /** List sent emails, newest first. */
  list(params: ListEmailsOptions = {}, options: RequestOptions = {}): Promise<Response<List<Email>>> {
    return this.req('GET', `/emails${query(params)}`, undefined, options);
  }

  /** Move a scheduled email to a new send time. */
  update(id: string, params: UpdateEmailOptions, options: RequestOptions = {}): Promise<Response<SendEmailResponse>> {
    return this.req('PATCH', `/emails/${seg(id)}`, toWire(params), options);
  }

  /** Cancel a scheduled or queued email that has not been sent. */
  cancel(id: string, options: RequestOptions = {}): Promise<Response<{ object: 'email'; id: string; status: 'cancelled' }>> {
    return this.req('POST', `/emails/${seg(id)}/cancel`, undefined, options);
  }

  /** Send the same message again, optionally to different recipients. */
  resend(id: string, params: { to?: string | string[] } = {}, options: RequestOptions = {}): Promise<Response<SendEmailResponse>> {
    return this.req('POST', `/emails/${seg(id)}/resend`, toWire(params), { ...options, autoIdempotency: true });
  }
}
