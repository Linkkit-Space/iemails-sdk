export { IEmails, IEmails as Iemails, DEFAULT_BASE_URL } from './iemails';
export { VERSION } from './version';
export { verifyWebhook, WebhookVerificationError, WEBHOOK_EVENT_TYPES } from './webhooks/webhooks';

export type * from './interfaces';
export type * from './emails/interfaces';
export type { Domain, DnsRecord, CreateDomainOptions } from './domains/domains';
export type { Contact, CreateContactOptions, UpdateContactOptions, ListContactsOptions } from './contacts/contacts';
export type { Broadcast, BroadcastStatus, CreateBroadcastOptions, UpdateBroadcastOptions } from './broadcasts/broadcasts';
export type { Template, CreateTemplateOptions, UpdateTemplateOptions } from './templates/templates';
export type { Webhook, WebhookEvent, WebhookEventType, CreateWebhookOptions, VerifyWebhookOptions } from './webhooks/webhooks';
export type { ReceivedEmail } from './inbound/inbound';
export type { Inbox, Thread, Label, Draft, CreateInboxOptions, ListThreadsOptions, MessageOptions, CreateDraftOptions } from './inboxes/inboxes';
export type { TrackEventOptions } from './events/events';
