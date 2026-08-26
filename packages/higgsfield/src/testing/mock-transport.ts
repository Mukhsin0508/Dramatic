import type { HttpTransport, TransportRequest, TransportResponse } from "../transport.js";

export type MockTransportStep =
  | TransportResponse
  | Error
  | ((request: TransportRequest) => TransportResponse | Promise<TransportResponse>);

export class MockTransport implements HttpTransport {
  readonly requests: TransportRequest[] = [];
  readonly #steps: MockTransportStep[];

  constructor(steps: readonly MockTransportStep[] = []) {
    this.#steps = [...steps];
  }

  enqueue(...steps: readonly MockTransportStep[]): void {
    this.#steps.push(...steps);
  }

  async send(request: TransportRequest): Promise<TransportResponse> {
    this.requests.push(request);
    const step = this.#steps.shift();
    if (!step) throw new Error(`Unexpected ${request.method} ${request.url}`);
    if (step instanceof Error) throw step;
    return typeof step === "function" ? step(request) : step;
  }

  assertExhausted(): void {
    if (this.#steps.length !== 0) throw new Error(`${this.#steps.length} mock transport step(s) were not used.`);
  }
}

export function mockResponse(options: {
  readonly status?: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string | Uint8Array;
} = {}): TransportResponse {
  const body = options.body === undefined
    ? null
    : new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(typeof options.body === "string" ? new TextEncoder().encode(options.body) : options.body);
          controller.close();
        },
      });
  return { status: options.status ?? 200, headers: new Headers(options.headers), body };
}
