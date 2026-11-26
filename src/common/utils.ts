const snake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/**
 * camelCase → snake_case for the top-level keys of a request body. Nested
 * values (headers, variables, metadata, properties…) are the caller's own data
 * and are passed through untouched. Undefined values are dropped.
 */
export function toWire(input: object, nested: Record<string, (v: any) => unknown> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    const mapped = nested[key] ? nested[key]!(value) : value;
    out[snake(key)] = mapped instanceof Date ? mapped.toISOString() : mapped;
  }
  return out;
}

/** Builds a query string from defined values. */
export function query(params: object = {}): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const v = value instanceof Date ? value.toISOString() : Array.isArray(value) ? value.join(',') : String(value);
    q.set(snake(key), v);
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const seg = (value: string) => encodeURIComponent(value);

export function randomId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function readEnv(name: string): string | undefined {
  const g = globalThis as { process?: { env?: Record<string, string | undefined> }; Deno?: { env?: { get(n: string): string | undefined } } };
  try {
    return g.process?.env?.[name] ?? g.Deno?.env?.get(name);
  } catch {
    return undefined; // Deno without --allow-env
  }
}
