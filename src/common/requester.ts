import type { Response } from '../interfaces';
import type { CallOptions, Method } from './http';

/** What every resource uses to call the API. Bound to one IEmails client. */
export type Requester = <T>(method: Method, path: string, body?: unknown, opts?: CallOptions) => Promise<Response<T>>;

export function toBase64(content: string | Uint8Array | ArrayBuffer): string {
  if (typeof content === 'string') return content;
  const bytes = content instanceof Uint8Array ? content : new Uint8Array(content);
  const B = (globalThis as { Buffer?: { from(b: Uint8Array): { toString(enc: string): string } } }).Buffer;
  if (B) return B.from(bytes).toString('base64');
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
