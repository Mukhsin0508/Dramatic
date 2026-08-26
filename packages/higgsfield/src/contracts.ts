export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface OperationSpec<TInput = unknown> {
  readonly input: TInput;
}

export type OperationMap = Readonly<Record<string, OperationSpec>>;
export type OperationName<Operations extends OperationMap> = Extract<keyof Operations, string>;

export interface GenerationHandle<Operation extends string = string> {
  readonly provider: string;
  readonly operation: Operation;
  readonly id: string;
  /** Opaque provider locator. Consumers must persist but never interpret it. */
  readonly statusToken: string;
  /** Opaque provider locator. Its absence means cancellation is unavailable. */
  readonly cancelToken?: string;
  readonly acceptedAt: string;
  readonly correlationId?: string;
}

export type GenerationStatus =
  | "queued"
  | "in_progress"
  | "completed"
  | "failed"
  | "moderated"
  | "canceled";

export type ArtifactKind = "image" | "video" | "audio" | "archive" | "model" | "other";

export interface MediaArtifact {
  readonly id: string;
  readonly kind: ArtifactKind;
  readonly url: string;
  readonly contentType?: string;
}

export interface ClientTiming {
  readonly acceptedAt: string;
  readonly lastObservedAt: string;
  readonly terminalObservedAt?: string;
  readonly submitLatencyMs?: number;
  readonly observedEndToEndLatencyMs?: number;
  readonly pollCount: number;
}

interface SnapshotBase<Operation extends string> {
  readonly handle: GenerationHandle<Operation>;
  readonly timing: ClientTiming;
  readonly correlationId?: string;
}

export type GenerationSnapshot<Operation extends string = string> =
  | (SnapshotBase<Operation> & {
      readonly status: "queued" | "in_progress";
      readonly artifacts: readonly [];
    })
  | (SnapshotBase<Operation> & {
      readonly status: "completed";
      readonly artifacts: readonly MediaArtifact[];
    })
  | (SnapshotBase<Operation> & {
      readonly status: "failed";
      readonly artifacts: readonly [];
      readonly failure: { readonly kind: "provider"; readonly message?: string };
    })
  | (SnapshotBase<Operation> & {
      readonly status: "moderated";
      readonly artifacts: readonly [];
      readonly failure: { readonly kind: "moderated" };
    })
  | (SnapshotBase<Operation> & {
      readonly status: "canceled";
      readonly artifacts: readonly [];
      readonly failure: { readonly kind: "canceled" };
    });

export type TerminalGeneration<Operation extends string = string> = Extract<
  GenerationSnapshot<Operation>,
  { readonly status: "completed" | "failed" | "moderated" | "canceled" }
>;

export type DecimalString = string & { readonly __decimalString: unique symbol };

export interface CostEstimate {
  readonly credits?: DecimalString;
  readonly money?: { readonly currency: "USD"; readonly amount: DecimalString };
  readonly observedAt: string;
  readonly correlationId?: string;
}

export interface SubmitOptions {
  readonly signal?: AbortSignal;
  readonly idempotency?: { readonly key: string; readonly ttlMs: number };
}

export interface RetryScheduled {
  readonly phase: "status" | "download";
  readonly attempt: number;
  readonly delayMs: number;
  readonly errorCode: string;
  readonly requestId?: string;
}

export interface WaitOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs: number;
  readonly initialDelayMs?: number;
  readonly maxDelayMs?: number;
  readonly multiplier?: number;
  readonly jitterRatio?: number;
  readonly maxConsecutiveErrors?: number;
  readonly onStatus?: (snapshot: GenerationSnapshot) => void | Promise<void>;
  readonly onRetry?: (event: RetryScheduled) => void | Promise<void>;
}

export type CancelResult =
  | { readonly outcome: "accepted"; readonly observedAt: string; readonly correlationId?: string }
  | { readonly outcome: "too_late"; readonly observedAt: string; readonly correlationId?: string }
  | { readonly outcome: "unsupported"; readonly observedAt: string };

export interface DownloadProgress {
  readonly artifactId: string;
  readonly bytesReceived: number;
  readonly totalBytes?: number;
}

export interface ArtifactSink {
  consume(
    chunks: AsyncIterable<Uint8Array>,
    metadata: {
      readonly artifact: MediaArtifact;
      readonly contentType?: string;
      readonly contentLength?: number;
    },
  ): Promise<{ readonly location: string }>;
}

export interface DownloadOptions {
  readonly signal?: AbortSignal;
  readonly maxBytes: number;
  readonly expectedSha256?: string;
  readonly maxRedirects?: number;
  readonly onProgress?: (event: DownloadProgress) => void | Promise<void>;
}

export interface DownloadReceipt {
  readonly location: string;
  readonly bytesWritten: number;
  readonly sha256: string;
  readonly contentType?: string;
}

export interface GenerationHooks {
  readonly onAccepted?: (handle: GenerationHandle) => void | Promise<void>;
  readonly onStatus?: (snapshot: GenerationSnapshot) => void | Promise<void>;
  readonly onRetry?: (event: RetryScheduled) => void | Promise<void>;
  readonly onCostEstimated?: (estimate: CostEstimate) => void | Promise<void>;
  readonly onDownloadProgress?: (event: DownloadProgress) => void | Promise<void>;
}

export interface GenerationClient<Operations extends OperationMap> {
  estimate<Operation extends OperationName<Operations>>(
    operation: Operation,
    input: Operations[Operation]["input"],
    options?: { readonly signal?: AbortSignal },
  ): Promise<CostEstimate>;

  submit<Operation extends OperationName<Operations>>(
    operation: Operation,
    input: Operations[Operation]["input"],
    options?: SubmitOptions,
  ): Promise<GenerationHandle<Operation>>;

  get<Operation extends OperationName<Operations>>(
    handle: GenerationHandle<Operation>,
    options?: { readonly signal?: AbortSignal },
  ): Promise<GenerationSnapshot<Operation>>;

  wait<Operation extends OperationName<Operations>>(
    handle: GenerationHandle<Operation>,
    options: WaitOptions,
  ): Promise<TerminalGeneration<Operation>>;

  cancel<Operation extends OperationName<Operations>>(
    handle: GenerationHandle<Operation>,
    options?: { readonly signal?: AbortSignal },
  ): Promise<CancelResult>;

  download(
    artifact: MediaArtifact,
    sink: ArtifactSink,
    options: DownloadOptions,
  ): Promise<DownloadReceipt>;
}
