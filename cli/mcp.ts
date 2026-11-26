/*
 * `iemails mcp`: a local MCP server over stdio. Each JSON-RPC message read
 * from stdin is forwarded to the hosted iemails MCP server with your API key,
 * and the reply is written to stdout, one message per line (the MCP stdio
 * transport). It gives clients that prefer a local command the same tools,
 * with the key taken from the environment or `iemails login`.
 *
 * Nothing but JSON-RPC may go to stdout; diagnostics go to stderr.
 */
import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import { VERSION } from '../src/version';

export const DEFAULT_MCP_URL = 'https://iemails.co/api/mcp';

export interface McpBridgeOptions {
  apiKey: string;
  url: string;
  from?: string;
  input: Readable;
  output: Writable;
  log: (line: string) => void;
  fetch?: typeof fetch;
}

type Message = { jsonrpc?: string; id?: string | number | null; method?: string };

const rpcError = (id: Message['id'], code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

/** Runs until stdin closes. Resolves with the exit code. */
export function runMcpBridge(opts: McpBridgeOptions): Promise<number> {
  const doFetch = opts.fetch ?? fetch;
  const headers: Record<string, string> = {
    authorization: `Bearer ${opts.apiKey}`,
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'user-agent': `iemails-cli/${VERSION} (mcp stdio)`,
  };
  if (opts.from) headers['x-iemails-from'] = opts.from;
  let protocolVersion: string | null = null;

  const write = (msg: unknown) => { opts.output.write(`${JSON.stringify(msg)}\n`); };

  const forward = async (line: string) => {
    let msg: Message;
    try {
      msg = JSON.parse(line) as Message;
    } catch {
      write(rpcError(null, -32700, 'Parse error: each line must be one JSON-RPC message'));
      return;
    }
    try {
      const res = await doFetch(opts.url, { method: 'POST', headers: protocolVersion ? { ...headers, 'mcp-protocol-version': protocolVersion } : headers, body: line });
      const text = await res.text();
      if (res.status === 202 || !text) return; // notification: no reply
      let reply: unknown;
      if ((res.headers.get('content-type') ?? '').includes('text/event-stream')) {
        // A server may answer with SSE; take each `data:` payload as a message.
        for (const chunk of text.split(/\n\n/)) {
          const data = chunk.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n');
          if (data) write(JSON.parse(data));
        }
        return;
      }
      try { reply = JSON.parse(text); } catch {
        write(rpcError(msg.id, -32603, `iemails MCP server returned HTTP ${res.status} that is not JSON. Check the URL (${opts.url}).`));
        return;
      }
      if (msg.method === 'initialize') {
        const v = (reply as { result?: { protocolVersion?: string } }).result?.protocolVersion;
        if (v) protocolVersion = v;
      }
      if (res.status === 401) opts.log('iemails mcp: the API key was rejected (401). Run iemails login or set IEMAILS_API_KEY.');
      if (Array.isArray(reply)) reply.forEach(write);
      else write(reply);
    } catch (e) {
      if (msg.id !== undefined) write(rpcError(msg.id, -32603, `Could not reach the iemails MCP server: ${(e as Error).message}`));
      opts.log(`iemails mcp: ${(e as Error).message}`);
    }
  };

  return new Promise((resolve) => {
    // Replies keep request order: each message waits for the one before it.
    let chain = Promise.resolve();
    const rl = createInterface({ input: opts.input, crlfDelay: Infinity });
    rl.on('line', (line) => {
      if (!line.trim()) return;
      chain = chain.then(() => forward(line));
    });
    rl.on('close', () => { void chain.then(() => resolve(0)); });
  });
}
