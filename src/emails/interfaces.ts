import type { PaginationOptions } from '../interfaces';

export interface Attachment {
  filename: string;
  /** Base64 string, or raw bytes (encoded for you). */
  content: string | Uint8Array | ArrayBuffer;
  contentType?: string;
}

export interface Tag {
  name: string;
  value: string;
}

export interface SendEmailOptions {
  /** `you@your-domain.com` or `Name <you@your-domain.com>`, on a verified domain. */
  from: string;
  /** One address or a list. Up to 50 across to, cc and bcc. */
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string | string[];
  subject?: string;
  html?: string;
  text?: string;
  /** Slug of a published template, rendered with `variables`. */
  template?: string;
  variables?: Record<string, unknown>;
  /** Send later: a Date or ISO 8601 time, up to 30 days ahead. */
  scheduledAt?: Date | string;
  headers?: Record<string, string>;
  tags?: Tag[];
  metadata?: Record<string, unknown>;
  attachments?: Attachment[];
}

export interface SendEmailResponse {
  object: 'email';
  id: string;
  status: 'queued' | 'scheduled' | 'simulated' | (string & {});
  scheduled_at: string | null;
}

export type EmailStatus = 'queued' | 'scheduled' | 'sent' | 'delivered' | 'bounced' | 'complained' | 'failed' | 'cancelled' | 'simulated' | (string & {});

export interface EmailEvent {
  object: 'email_event';
  id: string;
  type: string;
  recipient: string | null;
  data: Record<string, unknown>;
  occurred_at: string;
}

export interface Email {
  object: 'email';
  id: string;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  reply_to: string[];
  subject: string;
  status: EmailStatus;
  kind: 'transactional' | 'marketing' | (string & {});
  tags: Tag[];
  metadata: Record<string, unknown>;
  html?: string | null;
  text?: string | null;
  created_at: string;
  scheduled_at: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  last_event: string;
  /** Present on `get`: the delivery timeline. */
  events?: EmailEvent[];
}

export interface ListEmailsOptions extends PaginationOptions {
  status?: EmailStatus;
  /** Matches subject, recipient address or email id. */
  q?: string;
  since?: Date | string;
  until?: Date | string;
}

export interface UpdateEmailOptions {
  scheduledAt: Date | string;
}

export interface BatchResult {
  object: 'batch';
  queued: number;
  failed: number;
  /** One entry per input email, in order: an id, or the error for that entry. */
  data: ({ index: number; id: string; status: string } | { index: number; error: { code: string; message: string; details?: unknown } })[];
}
