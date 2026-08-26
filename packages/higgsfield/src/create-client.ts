import { DefaultGenerationClient, type ClientRuntime } from "./client.js";
import type { GenerationHooks, OperationMap } from "./contracts.js";
import { loadHiggsfieldConfig, type ConfigOverrides } from "./config.js";
import { HiggsfieldProvider, type HiggsfieldSchemaAdapter } from "./higgsfield-provider.js";
import { InMemoryIdempotencyStore, type IdempotencyStore } from "./idempotency.js";
import { FetchTransport, PinnedHttpsTransport, type HttpTransport } from "./transport.js";
import type { HostResolver } from "./url-policy.js";

export interface CreateHiggsfieldClientOptions<Operations extends OperationMap> {
  /** Generated/manual schema binding. No operations are built into this package. */
  readonly schema: HiggsfieldSchemaAdapter<Operations>;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly config?: ConfigOverrides;
  readonly transport?: HttpTransport;
  /** Separate artifact transport; production defaults to DNS-pinned HTTPS. */
  readonly downloadTransport?: HttpTransport;
  readonly hostResolver?: HostResolver;
  readonly idempotencyStore?: IdempotencyStore;
  readonly hooks?: GenerationHooks;
  readonly runtime?: Partial<ClientRuntime>;
}

export function createHiggsfieldClient<Operations extends OperationMap>(
  options: CreateHiggsfieldClientOptions<Operations>,
): DefaultGenerationClient<Operations> {
  if (typeof process === "undefined" || !process.versions?.node) {
    throw new Error("Higgsfield credentials may only be configured in a server-side Node.js runtime.");
  }
  const transport = options.transport ?? new FetchTransport();
  const config = loadHiggsfieldConfig(options.env ?? process.env, options.config);
  const provider = new HiggsfieldProvider({
    schema: options.schema,
    config,
    transport,
    now: options.runtime?.now,
  });
  return new DefaultGenerationClient({
    provider,
    idempotencyStore: options.idempotencyStore ?? new InMemoryIdempotencyStore(options.runtime?.now),
    downloadTransport: options.downloadTransport ?? new PinnedHttpsTransport(),
    hostResolver: options.hostResolver,
    hooks: options.hooks,
    runtime: options.runtime,
  });
}
