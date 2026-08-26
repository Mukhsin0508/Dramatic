import { createHash } from "node:crypto";

import { submissionFingerprint } from "./canonical-json.js";
import type {
  ArtifactSink,
  CancelResult,
  CostEstimate,
  DownloadOptions,
  DownloadReceipt,
  GenerationClient,
  GenerationHandle,
  GenerationHooks,
  GenerationSnapshot,
  MediaArtifact,
  OperationMap,
  OperationName,
  RetryScheduled,
  SubmitOptions,
  TerminalGeneration,
  WaitOptions,
} from "./contracts.js";
import {
  AbortedError,
  AmbiguousSubmissionError,
  asGenerationError,
  DownloadError,
  GenerationClientError,
  IdempotencyConflictError,
  IntegrityError,
  PollTimeoutError,
  SubmissionInProgressError,
} from "./errors.js";
import type { IdempotencyStore } from "./idempotency.js";
import type { GenerationProvider } from "./provider.js";
import type { HttpTransport, TransportResponse } from "./transport.js";
import { NodeHostResolver, resolveSafeDownloadTarget, type HostResolver } from "./url-policy.js";

export interface ClientRuntime {
  readonly now: () => Date;
  readonly random: () => number;
  readonly sleep: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
}

export interface DefaultGenerationClientOptions<Operations extends OperationMap> {
  readonly provider: GenerationProvider<Operations>;
  readonly idempotencyStore: IdempotencyStore;
  readonly downloadTransport: HttpTransport;
  readonly hooks?: GenerationHooks;
  readonly runtime?: Partial<ClientRuntime>;
  readonly downloadTimeoutMs?: number;
  readonly hostResolver?: HostResolver;
}

export class DefaultGenerationClient<Operations extends OperationMap>
  implements GenerationClient<Operations>
{
  readonly #provider: GenerationProvider<Operations>;
  readonly #idempotency: IdempotencyStore;
  readonly #transport: HttpTransport;
  readonly #hooks?: GenerationHooks;
  readonly #runtime: ClientRuntime;
  readonly #downloadTimeoutMs: number;
  readonly #hostResolver: HostResolver;

  constructor(options: DefaultGenerationClientOptions<Operations>) {
    this.#provider = options.provider;
    this.#idempotency = options.idempotencyStore;
    this.#transport = options.downloadTransport;
    this.#hooks = options.hooks;
    this.#runtime = {
      now: options.runtime?.now ?? (() => new Date()),
      random: options.runtime?.random ?? Math.random,
      sleep: options.runtime?.sleep ?? abortableSleep,
    };
    this.#downloadTimeoutMs = options.downloadTimeoutMs ?? 30_000;
    this.#hostResolver = options.hostResolver ?? new NodeHostResolver();
  }

  async estimate<Operation extends OperationName<Operations>>(
    operation: Operation,
    input: Operations[Operation]["input"],
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<CostEstimate> {
    this.#throwIfAborted(options.signal);
    const estimate = await this.#provider.estimate(operation, input, options);
    this.#emit(this.#hooks?.onCostEstimated, estimate);
    return estimate;
  }

  async submit<Operation extends OperationName<Operations>>(
    operation: Operation,
    input: Operations[Operation]["input"],
    options: SubmitOptions = {},
  ): Promise<GenerationHandle<Operation>> {
    this.#throwIfAborted(options.signal);
    const idempotency = options.idempotency;
    if (!idempotency) {
      // Deliberately exactly one call: Higgsfield generation POSTs do not
      // currently support provider-side idempotency keys.
      try {
        const accepted = await this.#provider.submit(operation, input, options);
        this.#emit(this.#hooks?.onAccepted, accepted.handle);
        return accepted.handle;
      } catch (error) {
        const normalized = asGenerationError(error);
        if (isPossiblyAccepted(normalized)) throw new AmbiguousSubmissionError(undefined, normalized);
        throw normalized;
      }
    }
    if (!idempotency.key.trim() || !Number.isSafeInteger(idempotency.ttlMs) || idempotency.ttlMs <= 0) {
      throw new GenerationClientError("Invalid idempotency options.", { code: "invalid_input" });
    }

    const claim = await this.#idempotency.claim({
      scope: `${this.#provider.name}:${operation}`,
      key: idempotency.key,
      fingerprint: submissionFingerprint(operation, input),
      expiresAt: new Date(this.#runtime.now().getTime() + idempotency.ttlMs).toISOString(),
    });
    if (claim.state === "replay") return claim.handle as GenerationHandle<Operation>;
    if (claim.state === "conflict") throw new IdempotencyConflictError();
    if (claim.state === "in_flight") throw new SubmissionInProgressError();
    if (claim.state === "ambiguous") throw new AmbiguousSubmissionError();

    try {
      const accepted = await this.#provider.submit(operation, input, options);
      await this.#idempotency.markAccepted(claim.leaseId, accepted.handle);
      this.#emit(this.#hooks?.onAccepted, accepted.handle);
      return accepted.handle;
    } catch (error) {
      const normalized = asGenerationError(error);
      if (!isPossiblyAccepted(normalized)) {
        await this.#idempotency.release(claim.leaseId);
        throw normalized;
      }
      await this.#idempotency.markAmbiguous(claim.leaseId, this.#runtime.now().toISOString());
      throw new AmbiguousSubmissionError(undefined, normalized);
    }
  }

  async get<Operation extends OperationName<Operations>>(
    handle: GenerationHandle<Operation>,
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<GenerationSnapshot<Operation>> {
    this.#throwIfAborted(options.signal);
    const snapshot = await this.#provider.status(handle, options);
    this.#emitStatus(snapshot);
    return snapshot;
  }

  async wait<Operation extends OperationName<Operations>>(
    handle: GenerationHandle<Operation>,
    options: WaitOptions,
  ): Promise<TerminalGeneration<Operation>> {
    validateWaitOptions(options);
    const startedAt = this.#runtime.now().getTime();
    const deadline = startedAt + options.timeoutMs;
    let delay = options.initialDelayMs ?? 2_000;
    const maxDelay = options.maxDelayMs ?? 10_000;
    const multiplier = options.multiplier ?? 1.5;
    const jitterRatio = options.jitterRatio ?? 0.2;
    const maxErrors = options.maxConsecutiveErrors ?? 4;
    let pollCount = 0;
    let consecutiveErrors = 0;
    let lastSnapshot: GenerationSnapshot<Operation> | undefined;

    while (true) {
      this.#throwIfAborted(options.signal);
      const remaining = deadline - this.#runtime.now().getTime();
      if (remaining <= 0) throw new PollTimeoutError(handle.id, lastSnapshot?.status);
      const randomSample = Math.min(1, Math.max(0, this.#runtime.random()));
      const jitter = delay * jitterRatio * randomSample;
      await this.#runtime.sleep(Math.min(delay + jitter, remaining), options.signal);
      if (this.#runtime.now().getTime() >= deadline) {
        throw new PollTimeoutError(handle.id, lastSnapshot?.status);
      }

      try {
        pollCount += 1;
        const observed = await this.#provider.status(handle, { signal: options.signal });
        consecutiveErrors = 0;
        const snapshot = {
          ...observed,
          timing: { ...observed.timing, pollCount },
        } as GenerationSnapshot<Operation>;
        lastSnapshot = snapshot;
        this.#emitStatus(snapshot, options.onStatus);
        if (isTerminal(snapshot)) return snapshot;
      } catch (error) {
        const normalized = asGenerationError(error);
        if (!normalized.retryable || ++consecutiveErrors > maxErrors) throw normalized;
        const event: RetryScheduled = {
          phase: "status",
          attempt: consecutiveErrors,
          delayMs: delay,
          errorCode: normalized.code,
          requestId: handle.id,
        };
        this.#emit(this.#hooks?.onRetry, event);
        this.#emit(options.onRetry, event);
      }
      delay = Math.min(delay * multiplier, maxDelay);
    }
  }

  async cancel<Operation extends OperationName<Operations>>(
    handle: GenerationHandle<Operation>,
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<CancelResult> {
    this.#throwIfAborted(options.signal);
    return this.#provider.cancel(handle, options);
  }

  async download(
    artifact: MediaArtifact,
    sink: ArtifactSink,
    options: DownloadOptions,
  ): Promise<DownloadReceipt> {
    if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes <= 0) {
      throw new GenerationClientError("maxBytes must be a positive safe integer.", { code: "invalid_input" });
    }
    this.#throwIfAborted(options.signal);
    const response = await this.#downloadWithRedirects(artifact.url, options, 0);
    if (response.status < 200 || response.status >= 300 || !response.body) {
      throw new DownloadError(`Artifact download failed with HTTP ${response.status}.`);
    }
    const lengthHeader = response.headers.get("content-length");
    const contentLength = lengthHeader ? Number(lengthHeader) : undefined;
    if (contentLength !== undefined && (!Number.isSafeInteger(contentLength) || contentLength < 0 || contentLength > options.maxBytes)) {
      throw new DownloadError("Artifact exceeds maxBytes.");
    }

    const hash = createHash("sha256");
    let bytesWritten = 0;
    const progress = (event: { artifactId: string; bytesReceived: number; totalBytes?: number }): void => {
      this.#emit(this.#hooks?.onDownloadProgress, event);
      this.#emit(options.onProgress, event);
    };
    const chunks = streamChunks(response.body, (chunk) => {
      bytesWritten += chunk.byteLength;
      if (bytesWritten > options.maxBytes) throw new DownloadError("Artifact exceeded maxBytes while streaming.");
      hash.update(chunk);
      progress({ artifactId: artifact.id, bytesReceived: bytesWritten, ...(contentLength === undefined ? {} : { totalBytes: contentLength }) });
    });
    const contentType = response.headers.get("content-type") ?? artifact.contentType;
    const consumed = await sink.consume(chunks, {
      artifact,
      ...(contentType ? { contentType } : {}),
      ...(contentLength === undefined ? {} : { contentLength }),
    });
    const sha256 = hash.digest("hex");
    if (options.expectedSha256 && sha256.toLowerCase() !== options.expectedSha256.toLowerCase()) {
      throw new IntegrityError("Artifact SHA-256 did not match the expected digest.");
    }
    return { location: consumed.location, bytesWritten, sha256, ...(contentType ? { contentType } : {}) };
  }

  async #downloadWithRedirects(
    value: string,
    options: DownloadOptions,
    redirects: number,
  ): Promise<TransportResponse> {
    const target = await resolveSafeDownloadTarget(value, this.#hostResolver, options.signal);
    const url = target.url;
    const response = await this.#transport.send({
      method: "GET",
      url: url.href,
      timeoutMs: this.#downloadTimeoutMs,
      signal: options.signal,
      redirect: "manual",
      connectAddress: target.addresses[0],
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const maxRedirects = options.maxRedirects ?? 3;
    if (redirects >= maxRedirects) throw new DownloadError("Artifact download exceeded redirect limit.");
    const location = response.headers.get("location");
    if (!location) throw new DownloadError("Artifact redirect omitted Location.");
    return this.#downloadWithRedirects(new URL(location, url).href, options, redirects + 1);
  }

  #emit<T>(hook: ((value: T) => void | Promise<void>) | undefined, value: T): void {
    if (!hook) return;
    try {
      void Promise.resolve(hook(value)).catch(() => undefined);
    } catch {
      // Observability hooks are isolated from provider state transitions.
    }
  }

  #emitStatus(snapshot: GenerationSnapshot, local?: WaitOptions["onStatus"]): void {
    this.#emit(this.#hooks?.onStatus, snapshot);
    this.#emit(local, snapshot);
  }

  #throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) throw new AbortedError(signal.reason);
  }
}

function isTerminal<Operation extends string>(
  snapshot: GenerationSnapshot<Operation>,
): snapshot is TerminalGeneration<Operation> {
  return snapshot.status === "completed" || snapshot.status === "failed" || snapshot.status === "moderated" || snapshot.status === "canceled";
}

function isDefinitiveRejection(error: GenerationClientError): boolean {
  return error.code === "invalid_input" || error.code === "authentication" || error.code === "insufficient_credits" || error.code === "not_found" || error.code === "provider_rejected" || error.code === "configuration";
}

function isPossiblyAccepted(error: GenerationClientError): boolean {
  const dispatchState = "dispatchState" in error
    ? (error as GenerationClientError & { readonly dispatchState?: string }).dispatchState
    : undefined;
  return dispatchState !== "not_sent" && !isDefinitiveRejection(error);
}

function validateWaitOptions(options: WaitOptions): void {
  const initialDelay = options.initialDelayMs ?? 2_000;
  const maxDelay = options.maxDelayMs ?? 10_000;
  const multiplier = options.multiplier ?? 1.5;
  const positive = [options.timeoutMs, initialDelay, maxDelay, multiplier];
  if (positive.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new GenerationClientError("Polling durations and multiplier must be positive.", { code: "invalid_input" });
  }
  if (maxDelay < initialDelay || multiplier < 1) {
    throw new GenerationClientError("Polling maxDelayMs must cover initialDelayMs and multiplier must be at least 1.", { code: "invalid_input" });
  }
  const jitter = options.jitterRatio ?? 0.2;
  if (!Number.isFinite(jitter) || jitter < 0 || jitter > 1) {
    throw new GenerationClientError("jitterRatio must be between 0 and 1.", { code: "invalid_input" });
  }
  if (options.maxConsecutiveErrors !== undefined && (!Number.isSafeInteger(options.maxConsecutiveErrors) || options.maxConsecutiveErrors < 0)) {
    throw new GenerationClientError("maxConsecutiveErrors must be a non-negative safe integer.", { code: "invalid_input" });
  }
}

async function abortableSleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new AbortedError(signal.reason);
  await new Promise<void>((resolve, reject) => {
    const cleanup = (): void => signal?.removeEventListener("abort", abort);
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, milliseconds);
    const abort = (): void => {
      clearTimeout(timeout);
      cleanup();
      reject(new AbortedError(signal?.reason));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

async function* streamChunks(
  stream: ReadableStream<Uint8Array>,
  observe: (chunk: Uint8Array) => void,
): AsyncIterable<Uint8Array> {
  const reader = stream.getReader();
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) return;
      observe(result.value);
      yield result.value;
    }
  } finally {
    reader.releaseLock();
  }
}
