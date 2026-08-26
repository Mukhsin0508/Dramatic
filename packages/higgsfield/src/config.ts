import { ConfigurationError } from "./errors.js";

const DEFAULT_BASE_URL = "https://platform.higgsfield.ai";
const DEFAULT_USER_AGENT = "dramatic-higgsfield/0.1";
const ALLOWED_ENV_BASE_ORIGINS = new Set([
  "https://platform.higgsfield.ai",
  "https://dev-api.higgsfield.com",
]);

export class HiggsfieldCredentials {
  readonly #keyId: string;
  readonly #secret: string;

  private constructor(keyId: string, secret: string) {
    this.#keyId = keyId;
    this.#secret = secret;
  }

  static parse(value: string): HiggsfieldCredentials {
    if (/[\u0000-\u001f\u007f]/u.test(value)) {
      throw new ConfigurationError("Higgsfield credentials must not contain control characters.");
    }
    const separator = value.indexOf(":");
    if (separator <= 0 || separator === value.length - 1) {
      throw new ConfigurationError(
        "Higgsfield credentials must use the documented KEY_ID:KEY_SECRET format.",
      );
    }
    const keyId = value.slice(0, separator).trim();
    const secret = value.slice(separator + 1).trim();
    if (!keyId || !secret) {
      throw new ConfigurationError("Higgsfield key ID and secret must both be non-empty.");
    }
    return new HiggsfieldCredentials(keyId, secret);
  }

  authorizationHeader(): string {
    return `Key ${this.#keyId}:${this.#secret}`;
  }

  /**
   * Supplies the documented KEY_ID:KEY_SECRET pair to the official server SDK
   * without retaining it outside the callback. Never log or serialize `value`.
   */
  withOfficialSdkCredentials<Result>(callback: (value: string) => Result): Result {
    return callback(`${this.#keyId}:${this.#secret}`);
  }

  toString(): "[REDACTED]" {
    return "[REDACTED]";
  }

  toJSON(): "[REDACTED]" {
    return "[REDACTED]";
  }
}

export interface HiggsfieldConfig {
  readonly credentials: HiggsfieldCredentials;
  readonly baseUrl: URL;
  readonly trustedControlOrigins: ReadonlySet<string>;
  readonly requestTimeoutMs: number;
  readonly userAgent: string;
}

export interface ConfigOverrides {
  readonly baseUrl?: URL;
  readonly trustedControlOrigins?: readonly string[];
  readonly requestTimeoutMs?: number;
  readonly userAgent?: string;
}

export function loadHiggsfieldConfig(
  env: Readonly<Record<string, string | undefined>>,
  overrides: ConfigOverrides = {},
): HiggsfieldConfig {
  // HIGGSFIELD_API_KEY is the app-facing name. Its value is the complete
  // KEY_ID:KEY_SECRET credential, not only the secret. HF_CREDENTIALS is the
  // official SDK-compatible alias. Supporting a single documented shape keeps
  // auth behavior deterministic and avoids guessing unsupported bearer auth.
  const appCredential = normalizeOptional(env.HIGGSFIELD_API_KEY);
  const officialCredential = normalizeOptional(env.HF_CREDENTIALS);
  if (appCredential && officialCredential && appCredential !== officialCredential) {
    throw new ConfigurationError("HIGGSFIELD_API_KEY and HF_CREDENTIALS disagree.");
  }
  const rawCredential = appCredential ?? officialCredential;
  if (!rawCredential) {
    throw new ConfigurationError(
      "Set HIGGSFIELD_API_KEY (or HF_CREDENTIALS) to KEY_ID:KEY_SECRET on the server.",
    );
  }

  const baseUrl = parseBaseUrl(overrides.baseUrl ?? baseUrlFromEnv(env) ?? DEFAULT_BASE_URL);
  if (baseUrl.protocol !== "https:" && baseUrl.hostname !== "127.0.0.1" && baseUrl.hostname !== "localhost") {
    throw new ConfigurationError("Higgsfield base URL must use HTTPS.");
  }
  if (baseUrl.username || baseUrl.password) {
    throw new ConfigurationError("Higgsfield base URL must not contain credentials.");
  }
  if (baseUrl.pathname !== "/" || baseUrl.search || baseUrl.hash) {
    throw new ConfigurationError("Higgsfield base URL must be an origin without a path, query, or fragment.");
  }
  if (overrides.baseUrl === undefined && !ALLOWED_ENV_BASE_ORIGINS.has(baseUrl.origin)) {
    throw new ConfigurationError(
      "Higgsfield environment base URL must be the exact production or development origin.",
    );
  }

  const requestTimeoutMs = overrides.requestTimeoutMs ?? 30_000;
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs <= 0) {
    throw new ConfigurationError("requestTimeoutMs must be a positive safe integer.");
  }
  const userAgent = validateUserAgent(
    overrides.userAgent ?? env.HIGGSFIELD_USER_AGENT ?? DEFAULT_USER_AGENT,
  );

  const origins = new Set<string>([baseUrl.origin]);
  for (const origin of overrides.trustedControlOrigins ?? []) {
    const parsed = new URL(origin);
    if (parsed.origin !== origin || parsed.protocol !== "https:") {
      throw new ConfigurationError(`Invalid trusted control origin: ${origin}`);
    }
    origins.add(parsed.origin);
  }

  return Object.freeze({
    credentials: HiggsfieldCredentials.parse(rawCredential),
    baseUrl,
    trustedControlOrigins: origins,
    requestTimeoutMs,
    userAgent,
  });
}

function baseUrlFromEnv(
  env: Readonly<Record<string, string | undefined>>,
): string | undefined {
  const appBaseUrl = normalizeOptional(env.HIGGSFIELD_API_BASE_URL);
  const fieldGuideBaseUrl = normalizeOptional(env.HF_API_BASE);
  if (appBaseUrl && fieldGuideBaseUrl) {
    const appUrl = parseBaseUrl(appBaseUrl);
    const fieldGuideUrl = parseBaseUrl(fieldGuideBaseUrl);
    if (appUrl.href !== fieldGuideUrl.href) {
      throw new ConfigurationError("HIGGSFIELD_API_BASE_URL and HF_API_BASE disagree.");
    }
    return appUrl.href;
  }
  return appBaseUrl ?? fieldGuideBaseUrl;
}

function parseBaseUrl(value: URL | string): URL {
  try {
    return new URL(value);
  } catch (cause) {
    throw new ConfigurationError("Higgsfield base URL must be an absolute URL.", cause);
  }
}

function validateUserAgent(value: string): string {
  const normalized = value.trim();
  if (
    value !== normalized ||
    !normalized ||
    normalized.length > 128 ||
    !/^[\x21-\x7e](?:[\x20-\x7e]*[\x21-\x7e])?$/u.test(normalized)
  ) {
    throw new ConfigurationError(
      "Higgsfield user agent must be 1–128 printable ASCII characters without surrounding whitespace.",
    );
  }
  return normalized;
}

function normalizeOptional(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}
