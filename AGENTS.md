# iemails-sdk

Official Node.js SDK for the iemails API (server: the private `iemails` repo, routes under `src/app/api/v1`).

- One folder per API resource in `src/`; each class takes a `Requester` and returns `Promise<Response<T>>` (`{ data, error }`, never throws for API errors).
- Inputs are camelCase; `toWire` converts top-level keys to the API's snake_case. User-owned maps (headers, variables, metadata, properties) are never converted.
- Sends pass `autoIdempotency: true` so retries are safe. POST/PATCH without an idempotency key are never retried.
- Webhook signature: `v1,` + hex HMAC-SHA256 of `${webhook-id}.${webhook-timestamp}.${rawBody}` with the full `whsec_…` secret (matches `src/server/services/webhooks.ts` on the server).
- Zero runtime dependencies; must run on Node 20+, Bun, Deno and edge runtimes (use `fetch` and Web Crypto, no `node:` imports in `src/`).
- `npm test`, `npm run typecheck`, `npm run build`. Bump `src/version.ts` with `package.json`.
- `cli/` is the `iemails` command (bin `dist/cli.js`, built by tsup as a separate Node-only entry). It may use `node:` imports; `src/` may not. `cli/run.ts` takes an injectable io/env/fetch so it is unit-tested in `test/cli.spec.ts`. Human output in a TTY, JSON otherwise; exit codes 0 ok / 1 API error / 2 usage.
