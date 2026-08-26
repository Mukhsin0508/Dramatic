import {
  APIError as OfficialApiError,
  AuthenticationError as OfficialAuthenticationError,
  BadInputError as OfficialBadInputError,
  BrowserNotSupportedError,
  CredentialsMissedError,
  NotEnoughCreditsError as OfficialNotEnoughCreditsError,
  TimeoutError as OfficialTimeoutError,
  ValidationError as OfficialValidationError,
} from "@higgsfield/client";
import {
  createHiggsfieldClient as createOfficialSdkClient,
  type V2ClientConfig,
  type V2Response,
} from "@higgsfield/client/v2";

import { AbortedError, ConfigurationError, GenerationClientError, ProtocolError } from "./errors.js";
import type { OperationMap, OperationName } from "./contracts.js";
import {
  createHiggsfieldClient,
  type CreateHiggsfieldClientOptions,
} from "./create-client.js";
import { loadHiggsfieldConfig } from "./config.js";
import {
  mapHttpError,
  type HiggsfieldAcceptedEnvelope,
  type HiggsfieldRequestContext,
  type HiggsfieldSchemaAdapter,
} from "./higgsfield-provider.js";
import { readJsonBody, TransportError } from "./transport.js";

/** The narrow official-v2 surface used by this adapter and its test doubles. */
export interface HiggsfieldSdkClient {
  subscribe(
    endpoint: string,
    options: {
      readonly input: unknown;
      readonly withPolling?: boolean;
      readonly webhook?: { readonly url: string; readonly secret: string };
    },
  ): Promise<V2Response>;
}

export type HiggsfieldSdkEndpoints<Operations extends OperationMap> = Readonly<{
  [Operation in OperationName<Operations>]: string;
}>;

export interface CreateHiggsfieldSdkAdapterOptions<Operations extends OperationMap> {
  /**
   * Model endpoint paths come from the caller's authoritative schema. The
   * wrapper intentionally ships with no hard-coded models or endpoints.
   */
  readonly endpoints: HiggsfieldSdkEndpoints<Operations>;
  readonly sdkClient: HiggsfieldSdkClient;
}

/**
 * Binds official v2 SDK submissions to Dramatic's lifecycle-safe adapter.
 * Polling remains in DefaultGenerationClient so cancellation, hooks, and
 * retry classification keep one source of truth.
 */
export function createHiggsfieldSdkAdapter<Operations extends OperationMap>(
  options: CreateHiggsfieldSdkAdapterOptions<Operations>,
): HiggsfieldSchemaAdapter<Operations> {
  const endpoints = validateEndpoints(options.endpoints);
  return {
    async submit(operation, input, context) {
      if (context.signal?.aborted) throw new AbortedError(context.signal.reason);
      const endpoint = endpoints[operation];
      if (typeof endpoint !== "string") {
        throw new ConfigurationError(`Missing Higgsfield SDK endpoint for operation: ${operation}`);
      }
      try {
        const response = await options.sdkClient.subscribe(endpoint, {
          input,
          // The outer client owns polling and its retry/timeout policy.
          withPolling: false,
        });
        return sdkEnvelope(response);
      } catch (cause) {
        throw mapOfficialSdkError(cause);
      }
    },
    async status(statusUrl, context) {
      return requestStatus(statusUrl, context);
    },
    async cancel(cancelUrl, context) {
      const response = await context.transport.send({
        method: "POST",
        url: cancelUrl,
        headers: {
          Authorization: context.authorization,
          "User-Agent": context.userAgent,
        },
        signal: context.signal,
        timeoutMs: context.requestTimeoutMs,
        redirect: "manual",
      });
      return {
        statusCode: response.status,
        correlationId: correlationId(response.headers),
      };
    },
  };
}

export interface CreateSdkBackedHiggsfieldClientOptions<Operations extends OperationMap>
  extends Omit<CreateHiggsfieldClientOptions<Operations>, "schema"> {
  readonly endpoints: HiggsfieldSdkEndpoints<Operations>;
  /** Inject a narrow test double or a process-managed official v2 client. */
  readonly sdkClient?: HiggsfieldSdkClient;
}

/**
 * Creates the production wrapper around the official Higgsfield v2 SDK.
 * The SDK is configured with zero submission retries because the public API
 * does not expose a provider idempotency key.
 */
export function createSdkBackedHiggsfieldClient<Operations extends OperationMap>(
  options: CreateSdkBackedHiggsfieldClientOptions<Operations>,
) {
  assertServerRuntime();
  const env = options.env ?? process.env;
  const config = loadHiggsfieldConfig(env, options.config);
  const sdkClient = options.sdkClient ?? config.credentials.withOfficialSdkCredentials((credentials) => {
    const sdkConfig: V2ClientConfig = {
      credentials,
      baseURL: config.baseUrl.href,
      timeout: config.requestTimeoutMs,
      // A generation POST must never be replayed without provider idempotency.
      maxRetries: 0,
      // The official SDK supplies its own non-default Node.js User-Agent.
    };
    const client = createOfficialSdkClient();
    client.configure(sdkConfig);
    return client;
  });

  const { endpoints, sdkClient: _injectedSdkClient, ...clientOptions } = options;
  return createHiggsfieldClient({
    ...clientOptions,
    env,
    schema: createHiggsfieldSdkAdapter({ endpoints, sdkClient }),
  });
}

async function requestStatus(
  statusUrl: string,
  context: HiggsfieldRequestContext,
): Promise<HiggsfieldAcceptedEnvelope> {
  const response = await context.transport.send({
    method: "GET",
    url: statusUrl,
    headers: {
      Accept: "application/json",
      Authorization: context.authorization,
      "User-Agent": context.userAgent,
    },
    signal: context.signal,
    timeoutMs: context.requestTimeoutMs,
    redirect: "manual",
  });
  const requestCorrelationId = correlationId(response.headers);
  if (response.status !== 200) throw mapHttpError(response.status, requestCorrelationId);
  const body = await readJsonBody(response);
  if (!isRecord(body)) throw new ProtocolError("Higgsfield status response was not an object.");
  return { ...body, correlationId: requestCorrelationId } as unknown as HiggsfieldAcceptedEnvelope;
}

function sdkEnvelope(response: V2Response): HiggsfieldAcceptedEnvelope {
  if (!isRecord(response)) throw new ProtocolError("Higgsfield SDK response was not an object.");
  return response as unknown as HiggsfieldAcceptedEnvelope;
}

function validateEndpoints<Operations extends OperationMap>(
  endpoints: HiggsfieldSdkEndpoints<Operations>,
): HiggsfieldSdkEndpoints<Operations> {
  for (const [operation, endpoint] of Object.entries(endpoints)) {
    if (typeof endpoint !== "string" || !endpoint.trim()) {
      throw new ConfigurationError(`Missing Higgsfield SDK endpoint for operation: ${operation}`);
    }
    if (/^[a-z][a-z\d+.-]*:/iu.test(endpoint) || endpoint.startsWith("//")) {
      throw new ConfigurationError(`Higgsfield SDK endpoint must be a relative API path: ${operation}`);
    }
    const hasTraversalSegment = endpoint.split(/[/\\]/u).some((segment) => segment === "." || segment === "..");
    if (hasTraversalSegment || /[?#\u0000-\u001f\u007f]/u.test(endpoint)) {
      throw new ConfigurationError(`Higgsfield SDK endpoint contains unsafe path syntax: ${operation}`);
    }
  }
  return Object.freeze({ ...endpoints });
}

function mapOfficialSdkError(cause: unknown): Error {
  if (cause instanceof OfficialAuthenticationError || cause instanceof CredentialsMissedError) {
    return new GenerationClientError("Higgsfield authentication failed.", {
      code: "authentication",
      cause,
    });
  }
  if (cause instanceof OfficialNotEnoughCreditsError) {
    return new GenerationClientError("Higgsfield account has insufficient credits.", {
      code: "insufficient_credits",
      cause,
    });
  }
  if (cause instanceof OfficialBadInputError || cause instanceof OfficialValidationError) {
    return new GenerationClientError("Higgsfield rejected invalid input.", {
      code: "invalid_input",
      cause,
    });
  }
  if (cause instanceof OfficialApiError && cause.statusCode !== undefined) {
    return mapHttpError(cause.statusCode);
  }
  const axiosStatus = axiosResponseStatus(cause);
  if (axiosStatus !== undefined) return mapHttpError(axiosStatus);
  if (cause instanceof OfficialTimeoutError || isAxiosLikeError(cause)) {
    // The official SDK does not expose dispatch state or AbortSignal. Treat a
    // transport failure as possibly submitted so callers never replay it.
    return new TransportError("Higgsfield SDK transport failed after dispatch may have begun.", "possibly_sent", cause);
  }
  if (cause instanceof BrowserNotSupportedError) {
    return new ConfigurationError("The official Higgsfield SDK is server-side only.", cause);
  }
  return cause instanceof Error
    ? cause
    : new GenerationClientError("The Higgsfield SDK failed unexpectedly.", {
        code: "provider_rejected",
        cause,
      });
}

function isAxiosLikeError(value: unknown): value is { readonly isAxiosError: true } {
  return isRecord(value) && value.isAxiosError === true;
}

function axiosResponseStatus(value: unknown): number | undefined {
  if (!isRecord(value) || value.isAxiosError !== true || !isRecord(value.response)) return undefined;
  return typeof value.response.status === "number" ? value.response.status : undefined;
}

function correlationId(headers: Headers): string | undefined {
  return headers.get("x-correlation-id") ?? undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertServerRuntime(): void {
  if (typeof process === "undefined" || !process.versions?.node) {
    throw new ConfigurationError("The official Higgsfield SDK may only run in server-side Node.js.");
  }
}
