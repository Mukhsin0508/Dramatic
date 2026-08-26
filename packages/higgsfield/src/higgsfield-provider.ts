import type {
  ArtifactKind,
  CancelResult,
  CostEstimate,
  DecimalString,
  GenerationHandle,
  GenerationSnapshot,
  MediaArtifact,
  OperationMap,
  OperationName,
} from "./contracts.js";
import type { HiggsfieldConfig } from "./config.js";
import { GenerationClientError, ProtocolError } from "./errors.js";
import type { GenerationProvider, ProviderAccepted, ProviderCallContext } from "./provider.js";
import type { HttpTransport } from "./transport.js";
import { assertSafeDownloadUrl, assertTrustedControlUrl } from "./url-policy.js";

export interface HiggsfieldRequestContext extends ProviderCallContext {
  readonly baseUrl: URL;
  readonly authorization: string;
  readonly requestTimeoutMs: number;
  readonly userAgent: string;
  readonly transport: HttpTransport;
}

export interface HiggsfieldAcceptedEnvelope {
  readonly status: unknown;
  readonly request_id: unknown;
  readonly status_url?: unknown;
  readonly cancel_url?: unknown;
  readonly error?: unknown;
  readonly images?: unknown;
  readonly video?: unknown;
  readonly audio?: unknown;
  readonly audios?: unknown;
  readonly correlationId?: string;
}

export interface HiggsfieldEstimateEnvelope {
  readonly credits?: unknown;
  readonly usd?: unknown;
  readonly correlationId?: string;
}

export interface HiggsfieldCancelEnvelope {
  readonly statusCode: number;
  readonly correlationId?: string;
}

export interface HiggsfieldSchemaAdapter<Operations extends OperationMap> {
  submit<Operation extends OperationName<Operations>>(
    operation: Operation,
    input: Operations[Operation]["input"],
    context: HiggsfieldRequestContext,
  ): Promise<HiggsfieldAcceptedEnvelope>;

  estimate?<Operation extends OperationName<Operations>>(
    operation: Operation,
    input: Operations[Operation]["input"],
    context: HiggsfieldRequestContext,
  ): Promise<HiggsfieldEstimateEnvelope>;

  status(statusUrl: string, context: HiggsfieldRequestContext): Promise<HiggsfieldAcceptedEnvelope>;
  cancel(cancelUrl: string, context: HiggsfieldRequestContext): Promise<HiggsfieldCancelEnvelope>;
}

export class HiggsfieldProvider<Operations extends OperationMap>
  implements GenerationProvider<Operations>
{
  readonly name = "higgsfield";
  readonly #schema: HiggsfieldSchemaAdapter<Operations>;
  readonly #config: HiggsfieldConfig;
  readonly #transport: HttpTransport;
  readonly #now: () => Date;

  constructor(options: {
    readonly schema: HiggsfieldSchemaAdapter<Operations>;
    readonly config: HiggsfieldConfig;
    readonly transport: HttpTransport;
    readonly now?: () => Date;
  }) {
    this.#schema = options.schema;
    this.#config = options.config;
    this.#transport = options.transport;
    this.#now = options.now ?? (() => new Date());
  }

  async estimate<Operation extends OperationName<Operations>>(
    operation: Operation,
    input: Operations[Operation]["input"],
    context: ProviderCallContext,
  ): Promise<CostEstimate> {
    if (!this.#schema.estimate) {
      throw new GenerationClientError("Cost estimation is not bound by the supplied schema.", {
        code: "unsupported_capability",
      });
    }
    const response = await this.#schema.estimate(operation, input, this.#context(context));
    const credits = response.credits === undefined ? undefined : decimal(response.credits, "credits");
    const usd = response.usd === undefined ? undefined : decimal(response.usd, "usd");
    if (!credits && !usd) throw new ProtocolError("Higgsfield estimate did not include credits or USD.");
    return {
      ...(credits ? { credits } : {}),
      ...(usd ? { money: { currency: "USD", amount: usd } as const } : {}),
      observedAt: this.#now().toISOString(),
      correlationId: response.correlationId,
    };
  }

  async submit<Operation extends OperationName<Operations>>(
    operation: Operation,
    input: Operations[Operation]["input"],
    context: ProviderCallContext,
  ): Promise<ProviderAccepted<Operation>> {
    const started = this.#now();
    const response = await this.#schema.submit(operation, input, this.#context(context));
    const observed = this.#now();
    const handle = this.#handle(operation, response, started.toISOString());
    return {
      handle,
      initial: mapSnapshot(handle, response, observed, 0, observed.getTime() - started.getTime()),
    };
  }

  async status<Operation extends OperationName<Operations>>(
    handle: GenerationHandle<Operation>,
    context: ProviderCallContext,
  ): Promise<GenerationSnapshot<Operation>> {
    this.#assertHandle(handle);
    const statusUrl = assertTrustedControlUrl(handle.statusToken, this.#config.trustedControlOrigins).href;
    const response = await this.#schema.status(statusUrl, this.#context(context));
    if (response.request_id !== handle.id) throw new ProtocolError("Status response request ID did not match the handle.");
    return mapSnapshot(handle, response, this.#now(), 0);
  }

  async cancel<Operation extends OperationName<Operations>>(
    handle: GenerationHandle<Operation>,
    context: ProviderCallContext,
  ): Promise<CancelResult> {
    this.#assertHandle(handle);
    if (!handle.cancelToken) return { outcome: "unsupported", observedAt: this.#now().toISOString() };
    const cancelUrl = assertTrustedControlUrl(handle.cancelToken, this.#config.trustedControlOrigins).href;
    const response = await this.#schema.cancel(cancelUrl, this.#context(context));
    const common = { observedAt: this.#now().toISOString(), correlationId: response.correlationId };
    if (response.statusCode === 202) return { outcome: "accepted", ...common };
    if (response.statusCode === 400) return { outcome: "too_late", ...common };
    throw mapHttpError(response.statusCode, response.correlationId);
  }

  #handle<Operation extends OperationName<Operations>>(
    operation: Operation,
    response: HiggsfieldAcceptedEnvelope,
    acceptedAt: string,
  ): GenerationHandle<Operation> {
    if (typeof response.request_id !== "string" || !response.request_id) {
      throw new ProtocolError("Higgsfield response did not include a request ID.");
    }
    if (typeof response.status_url !== "string") {
      throw new ProtocolError("Higgsfield response did not include a status URL.");
    }
    const statusToken = assertTrustedControlUrl(response.status_url, this.#config.trustedControlOrigins).href;
    const cancelToken = response.cancel_url === undefined
      ? undefined
      : typeof response.cancel_url === "string"
        ? assertTrustedControlUrl(response.cancel_url, this.#config.trustedControlOrigins).href
        : (() => { throw new ProtocolError("Higgsfield cancel URL was invalid."); })();
    return {
      provider: this.name,
      operation,
      id: response.request_id,
      statusToken,
      ...(cancelToken ? { cancelToken } : {}),
      acceptedAt,
      correlationId: response.correlationId,
    };
  }

  #context(context: ProviderCallContext): HiggsfieldRequestContext {
    return {
      ...context,
      baseUrl: this.#config.baseUrl,
      authorization: this.#config.credentials.authorizationHeader(),
      requestTimeoutMs: this.#config.requestTimeoutMs,
      userAgent: this.#config.userAgent,
      transport: this.#transport,
    };
  }

  #assertHandle(handle: GenerationHandle): void {
    if (handle.provider !== this.name) throw new ProtocolError("Handle belongs to a different provider.");
  }
}

function mapSnapshot<Operation extends string>(
  handle: GenerationHandle<Operation>,
  response: HiggsfieldAcceptedEnvelope,
  observed: Date,
  pollCount: number,
  submitLatencyMs?: number,
): GenerationSnapshot<Operation> {
  const status = mapStatus(response.status);
  const common = {
    handle,
    timing: {
      acceptedAt: handle.acceptedAt,
      lastObservedAt: observed.toISOString(),
      ...(isTerminal(status) ? { terminalObservedAt: observed.toISOString() } : {}),
      ...(submitLatencyMs === undefined ? {} : { submitLatencyMs }),
      ...(isTerminal(status) ? { observedEndToEndLatencyMs: observed.getTime() - Date.parse(handle.acceptedAt) } : {}),
      pollCount,
    },
    correlationId: response.correlationId,
  };
  if (status === "queued" || status === "in_progress") return { ...common, status, artifacts: [] };
  if (status === "completed") return { ...common, status, artifacts: collectArtifacts(handle.id, response) };
  if (status === "failed") {
    const message = typeof response.error === "string" ? response.error : undefined;
    return { ...common, status, artifacts: [], failure: { kind: "provider", ...(message ? { message } : {}) } };
  }
  if (status === "moderated") return { ...common, status, artifacts: [], failure: { kind: "moderated" } };
  return { ...common, status, artifacts: [], failure: { kind: "canceled" } };
}

function mapStatus(value: unknown): GenerationSnapshot["status"] {
  if (value === "queued" || value === "in_progress" || value === "completed" || value === "failed" || value === "canceled") return value;
  if (value === "nsfw") return "moderated";
  throw new ProtocolError(`Unknown Higgsfield status: ${String(value)}`);
}

function isTerminal(status: GenerationSnapshot["status"]): boolean {
  return status === "completed" || status === "failed" || status === "moderated" || status === "canceled";
}

function collectArtifacts(requestId: string, response: HiggsfieldAcceptedEnvelope): readonly MediaArtifact[] {
  const artifacts: MediaArtifact[] = [];
  const push = (kind: ArtifactKind, value: unknown): void => {
    if (!isRecord(value) || typeof value.url !== "string") throw new ProtocolError(`Invalid ${kind} artifact.`);
    const url = assertSafeDownloadUrl(value.url).href;
    const contentType = typeof value.content_type === "string" ? value.content_type : undefined;
    artifacts.push({ id: `${requestId}:${artifacts.length}`, kind, url, ...(contentType ? { contentType } : {}) });
  };
  if (response.images !== undefined) {
    if (!Array.isArray(response.images)) throw new ProtocolError("Higgsfield images output was not an array.");
    for (const image of response.images) push("image", image);
  }
  if (response.video !== undefined) push("video", response.video);
  if (response.audio !== undefined) push("audio", response.audio);
  if (response.audios !== undefined) {
    if (!Array.isArray(response.audios)) throw new ProtocolError("Higgsfield audios output was not an array.");
    for (const audio of response.audios) push("audio", audio);
  }
  return artifacts;
}

function decimal(value: unknown, label: string): DecimalString {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(value)) {
    throw new ProtocolError(`Higgsfield ${label} estimate was not a non-negative decimal string.`);
  }
  return value as DecimalString;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function mapHttpError(status: number, correlationId?: string): GenerationClientError {
  if (status === 401) return new GenerationClientError("Higgsfield authentication failed.", { code: "authentication", correlationId });
  if (status === 403) return new GenerationClientError("Higgsfield account has insufficient credits.", { code: "insufficient_credits", correlationId });
  if (status === 404) return new GenerationClientError("Higgsfield resource was not found.", { code: "not_found", correlationId });
  if (status === 422) return new GenerationClientError("Higgsfield rejected invalid input.", { code: "invalid_input", correlationId });
  if (status === 423 || status === 503 || status >= 500) {
    return new GenerationClientError("Higgsfield is temporarily unavailable.", {
      code: "temporarily_unavailable",
      retryable: true,
      correlationId,
    });
  }
  return new GenerationClientError(`Higgsfield rejected the request with HTTP ${status}.`, {
    code: "provider_rejected",
    correlationId,
  });
}
