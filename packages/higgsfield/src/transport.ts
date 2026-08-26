import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { Readable } from "node:stream";

import { AbortedError, GenerationClientError } from "./errors.js";

export type DispatchState = "not_sent" | "possibly_sent" | "response_received";

export interface TransportRequest {
  readonly method: "GET" | "POST" | "PUT";
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: BodyInit | null;
  readonly signal?: AbortSignal;
  readonly timeoutMs: number;
  readonly redirect?: RequestRedirect;
  /** Approved IP to use without another DNS lookup (artifact downloads only). */
  readonly connectAddress?: { readonly address: string; readonly family: 4 | 6 };
}

export interface TransportResponse {
  readonly status: number;
  readonly headers: Headers;
  readonly body: ReadableStream<Uint8Array> | null;
}

export interface HttpTransport {
  send(request: TransportRequest): Promise<TransportResponse>;
}

export class TransportError extends GenerationClientError {
  readonly dispatchState: DispatchState;

  constructor(message: string, dispatchState: DispatchState, cause?: unknown) {
    super(message, { code: "network", retryable: true, cause });
    this.name = "TransportError";
    this.dispatchState = dispatchState;
  }
}

export class FetchTransport implements HttpTransport {
  readonly #fetch: typeof fetch;

  constructor(fetchImplementation: typeof fetch = globalThis.fetch) {
    if (typeof fetchImplementation !== "function") {
      throw new TypeError("A server-side fetch implementation is required.");
    }
    this.#fetch = fetchImplementation;
  }

  async send(request: TransportRequest): Promise<TransportResponse> {
    if (request.signal?.aborted) throw new AbortedError(request.signal.reason);
    if (request.connectAddress) {
      throw new TransportError("FetchTransport cannot pin a resolved connection address.", "not_sent");
    }
    let url: URL;
    try {
      url = new URL(request.url);
    } catch (cause) {
      throw new TransportError("Invalid request URL.", "not_sent", cause);
    }

    const timeoutController = new AbortController();
    const timeout = setTimeout(() => timeoutController.abort(new Error("Request timed out.")), request.timeoutMs);
    const signal = request.signal
      ? AbortSignal.any([request.signal, timeoutController.signal])
      : timeoutController.signal;

    try {
      const response = await this.#fetch(url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        signal,
        redirect: request.redirect ?? "manual",
      });
      return { status: response.status, headers: response.headers, body: response.body };
    } catch (cause) {
      if (request.signal?.aborted) throw new AbortedError(request.signal.reason);
      throw new TransportError("Transport failed after dispatch may have begun.", "possibly_sent", cause);
    } finally {
      clearTimeout(timeout);
    }
  }
}

/** HTTPS transport that pins a policy-approved IP while retaining hostname SNI/certificate checks. */
export class PinnedHttpsTransport implements HttpTransport {
  async send(request: TransportRequest): Promise<TransportResponse> {
    if (request.signal?.aborted) throw new AbortedError(request.signal.reason);
    const connectAddress = request.connectAddress;
    if (!connectAddress || isIP(connectAddress.address) !== connectAddress.family) {
      throw new TransportError("PinnedHttpsTransport requires a valid resolved connection address.", "not_sent");
    }

    let url: URL;
    try {
      url = new URL(request.url);
    } catch (cause) {
      throw new TransportError("Invalid request URL.", "not_sent", cause);
    }
    if (url.protocol !== "https:") {
      throw new TransportError("PinnedHttpsTransport only supports HTTPS.", "not_sent");
    }

    const timeoutController = new AbortController();
    const timeout = setTimeout(() => timeoutController.abort(new Error("Request timed out.")), request.timeoutMs);
    const signal = request.signal
      ? AbortSignal.any([request.signal, timeoutController.signal])
      : timeoutController.signal;

    try {
      return await new Promise<TransportResponse>((resolve, reject) => {
        const hostname = stripIpv6Brackets(url.hostname);
        const pinnedLookup: LookupFunction = (_lookupHostname, lookupOptions, callback) => {
          if (lookupOptions.all) {
            callback(null, [{ address: connectAddress.address, family: connectAddress.family }]);
          } else {
            callback(null, connectAddress.address, connectAddress.family);
          }
        };
        const outgoing = httpsRequest(url, {
          method: request.method,
          headers: request.headers,
          signal,
          ...(isIP(hostname) === 0 ? { servername: hostname } : {}),
          lookup: pinnedLookup,
        }, (incoming) => {
          resolve({
            status: incoming.statusCode ?? 0,
            headers: new Headers(normalizeIncomingHeaders(incoming.headers)),
            body: Readable.toWeb(incoming) as ReadableStream<Uint8Array>,
          });
        });
        outgoing.once("error", reject);
        if (request.body === undefined || request.body === null) {
          outgoing.end();
        } else if (typeof request.body === "string" || request.body instanceof Uint8Array) {
          outgoing.end(request.body);
        } else {
          outgoing.destroy(new TypeError("PinnedHttpsTransport supports string or byte request bodies only."));
        }
      });
    } catch (cause) {
      if (request.signal?.aborted) throw new AbortedError(request.signal.reason);
      throw new TransportError("Pinned HTTPS transport failed after dispatch may have begun.", "possibly_sent", cause);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function stripIpv6Brackets(hostname: string): string {
  return hostname.replace(/^\[|\]$/gu, "");
}

function normalizeIncomingHeaders(headers: import("node:http").IncomingHttpHeaders): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined) normalized[name] = Array.isArray(value) ? value.join(", ") : value;
  }
  return normalized;
}

export async function readJsonBody(response: TransportResponse, maxBytes = 1_048_576): Promise<unknown> {
  if (!response.body) return undefined;
  const bytes = await readBody(response.body, maxBytes);
  if (bytes.byteLength === 0) return undefined;
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch (cause) {
    throw new GenerationClientError("Provider returned malformed JSON.", { code: "protocol", cause });
  }
}

async function readBody(stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > maxBytes) {
        throw new GenerationClientError("Provider response exceeded the maximum size.", { code: "protocol" });
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}
