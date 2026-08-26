# `@dramatic/higgsfield`

Server-only, provider-neutral generation client backed by Higgsfield's official
TypeScript SDK. Callers supply the model operation map and documented endpoint
binding; application code should depend only on `GenerationClient<Operations>`.

## Official SDK binding

`createSdkBackedHiggsfieldClient` uses `@higgsfield/client/v2` for submission and
requires a caller-supplied operation-to-endpoint map. No model names or endpoint
paths are built into this package. The SDK is configured with `withPolling: false`
and zero POST retries; the outer client retains polling, cancellation,
idempotency, cost hooks, and download safety.

```ts
import { createSdkBackedHiggsfieldClient } from "@dramatic/higgsfield";

type Operations = {
  "episode.keyframe": {
    input: { prompt: string; aspect_ratio: "9:16" };
  };
};

const client = createSdkBackedHiggsfieldClient<Operations>({
  endpoints: {
    // Supply this path from Higgsfield's authoritative model documentation.
    "episode.keyframe": process.env.HIGGSFIELD_KEYFRAME_ENDPOINT!,
  },
});
```

The official v2 package currently uses process-global configuration internally,
so configure one SDK-backed Higgsfield client per worker process. Tests can inject
the narrow `HiggsfieldSdkClient` surface without loading credentials or making
network calls.

## Credentials

Set either environment variable to the complete credential pair:

```sh
HIGGSFIELD_API_KEY="KEY_ID:KEY_SECRET"
# Official SDK-compatible alias:
HF_CREDENTIALS="KEY_ID:KEY_SECRET"
```

Despite its app-facing name, `HIGGSFIELD_API_KEY` is **not** a secret-only token.
It must contain the official `KEY_ID:KEY_SECRET` shape used by
`Authorization: Key KEY_ID:KEY_SECRET`. If both variables are present, they must
match. The client rejects malformed values, keeps credential fields private, and
redacts string/JSON conversion. Construct it only in server-side composition code.

## Safety and lifecycle

- A generation submission is issued once. The client never automatically retries
  a POST because Higgsfield currently has no provider-side idempotency key.
- Optional application idempotency uses `IdempotencyStore`. The default in-memory
  store is suitable only for development and tests; inject an atomic durable store
  in production.
- A transport failure after dispatch may have begun marks the claim ambiguous.
  Reconciliation requires external request records/support; resubmission is not automatic.
- Polling begins at two seconds, backs off by 1.5x to ten seconds, adds jitter,
  retries only errors classified as retryable, and treats abort/timeout as local.
  Neither condition cancels remote work.
- Status and cancel locators are opaque and restricted to configured Higgsfield
  control origins. Artifact downloads require HTTPS and validate every redirect.
  Before each request, all DNS answers are rejected if any address is private,
  loopback, link-local, multicast, mapped IPv6, or another special-use range. The
  default `PinnedHttpsTransport` connects to an approved address directly while
  preserving the original hostname for TLS verification, preventing a second DNS
  lookup from rebinding the request. Custom download transports must honor the
  request's `connectAddress`; inject `HostResolver` for deterministic tests.
- Downloads stream through a caller-provided sink, enforce a byte cap, and can
  verify SHA-256.
- Store completed artifacts promptly; provider URLs are temporary.

See `src/generated/README.md` for the OpenAPI endpoint/type seam and
`@dramatic/higgsfield/testing` for deterministic provider and transport doubles.
