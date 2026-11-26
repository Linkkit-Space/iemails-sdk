/** Small terminal helpers: colour that respects NO_COLOR and plain tables. */

export interface Io {
  out: (text: string) => void;
  err: (text: string) => void;
  color: boolean;
}

const wrap = (code: number, reset: number) => (io: Io, s: string) => (io.color ? `\x1b[${code}m${s}\x1b[${reset}m` : s);
export const bold = wrap(1, 22);
export const dim = wrap(2, 22);
export const green = wrap(32, 39);
export const red = wrap(31, 39);
export const yellow = wrap(33, 39);

// eslint-disable-next-line no-control-regex
const visible = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '').length;

/** Left-aligned columns with a dim header row. */
export function table(io: Io, head: string[], rows: string[][]): string {
  if (!rows.length) return dim(io, 'Nothing to show.');
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => visible(r[i] ?? ''))));
  const line = (cells: string[]) => cells.map((c, i) => (i === cells.length - 1 ? c : c + ' '.repeat(widths[i]! - visible(c)))).join('  ');
  return [dim(io, line(head)), ...rows.map(line)].join('\n');
}

export function status(io: Io, s: string): string {
  if (['delivered', 'verified', 'sent', 'enabled', 'active'].includes(s)) return green(io, s);
  if (['bounced', 'failed', 'complained', 'cancelled', 'not_started', 'temporary_failure'].includes(s)) return red(io, s);
  return yellow(io, s);
}

export const when = (iso: unknown) => (typeof iso === 'string' ? iso.replace('T', ' ').replace(/\.\d+Z$/, 'Z') : '—');
