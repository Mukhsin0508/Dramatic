export type GenerationErrorCode =
  | "configuration"
  | "invalid_input"
  | "authentication"
  | "insufficient_credits"
  | "not_found"
  | "provider_rejected"
  | "temporarily_unavailable"
  | "network"
  | "ambiguous_submission"
  | "idempotency_conflict"
  | "submission_in_progress"
  | "poll_timeout"
  | "aborted"
  | "protocol"
  | "unsupported_capability"
  | "download"
  | "integrity";

export interface GenerationClientErrorOptions {
  readonly code: GenerationErrorCode;
  readonly retryable?: boolean;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly cause?: unknown;
}

export class GenerationClientError extends Error {
  readonly code: GenerationErrorCode;
  readonly retryable: boolean;
  readonly requestId?: string;
  readonly correlationId?: string;
  override readonly cause?: unknown;

  constructor(message: string, options: GenerationClientErrorOptions) {
    super(message);
    this.name = "GenerationClientError";
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    this.requestId = options.requestId;
    this.correlationId = options.correlationId;
    this.cause = options.cause;
  }
}

export class ConfigurationError extends GenerationClientError {
  constructor(message: string, cause?: unknown) {
    super(message, { code: "configuration", cause });
    this.name = "ConfigurationError";
  }
}

export class ProtocolError extends GenerationClientError {
  constructor(message: string, options: Omit<GenerationClientErrorOptions, "code"> = {}) {
    super(message, { ...options, code: "protocol" });
    this.name = "ProtocolError";
  }
}

export class AmbiguousSubmissionError extends GenerationClientError {
  constructor(message = "The provider may have accepted the submission; automatic retry is unsafe.", cause?: unknown) {
    super(message, { code: "ambiguous_submission", cause });
    this.name = "AmbiguousSubmissionError";
  }
}

export class IdempotencyConflictError extends GenerationClientError {
  constructor() {
    super("The idempotency key was already used with different input.", { code: "idempotency_conflict" });
    this.name = "IdempotencyConflictError";
  }
}

export class SubmissionInProgressError extends GenerationClientError {
  constructor() {
    super("A submission with this idempotency key is already in progress.", {
      code: "submission_in_progress",
      retryable: true,
    });
    this.name = "SubmissionInProgressError";
  }
}

export class PollTimeoutError extends GenerationClientError {
  readonly lastStatus?: string;

  constructor(requestId: string, lastStatus?: string) {
    super("Polling timed out; the remote generation may still be running.", {
      code: "poll_timeout",
      requestId,
      retryable: true,
    });
    this.name = "PollTimeoutError";
    this.lastStatus = lastStatus;
  }
}

export class AbortedError extends GenerationClientError {
  constructor(cause?: unknown) {
    super("The local operation was aborted; remote work was not canceled.", { code: "aborted", cause });
    this.name = "AbortedError";
  }
}

export class DownloadError extends GenerationClientError {
  constructor(message: string, cause?: unknown) {
    super(message, { code: "download", cause, retryable: true });
    this.name = "DownloadError";
  }
}

export class IntegrityError extends GenerationClientError {
  constructor(message: string) {
    super(message, { code: "integrity" });
    this.name = "IntegrityError";
  }
}

export function asGenerationError(error: unknown): GenerationClientError {
  if (error instanceof GenerationClientError) return error;
  return new GenerationClientError("Unexpected provider error.", {
    code: "network",
    retryable: true,
    cause: error,
  });
}
