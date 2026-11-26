import type { Requester } from '../common/requester';
import type { RequestOptions, Response } from '../interfaces';
import { emailBody } from '../emails/emails';
import type { BatchResult, SendEmailOptions } from '../emails/interfaces';

export class Batch {
  constructor(private readonly req: Requester) {}

  /**
   * Send up to 100 separate emails in one request. Each is queued on its own:
   * check `data.data` for an id or an error per entry (HTTP 207 when some failed).
   * Attachments and metadata are not supported in batches.
   */
  send(emails: SendEmailOptions[], options: RequestOptions = {}): Promise<Response<BatchResult>> {
    return this.req('POST', '/emails/batch', { emails: emails.map(emailBody) }, { ...options, autoIdempotency: true });
  }
}
