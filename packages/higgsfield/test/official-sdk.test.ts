import { createServer } from "node:http";

import { describe, expect, it, vi } from "vitest";

import {
  AmbiguousSubmissionError,
  ConfigurationError,
  createHiggsfieldSdkAdapter,
  createSdkBackedHiggsfieldClient,
  type HiggsfieldSdkClient,
  type OperationMap,
} from "../src/index.js";
import { MockTransport, mockResponse } from "../src/testing/index.js";

type Operations = {
  readonly "episode.keyframe": {
    readonly input: { readonly prompt: string; readonly aspect_ratio: "9:16" };
  };
};

const endpoint = "schema-provided/keyframe/v1";
const input = { prompt: "A tense elevator reveal", aspect_ratio: "9:16" as const };
const accepted = {
  status: "queued" as const,
  request_id: "request-1",
  status_url: "https://platform.higgsfield.ai/requests/request-1/status",
  cancel_url: "https://platform.higgsfield.ai/requests/request-1/cancel",
};

describe("official Higgsfield SDK adapter", () => {
  it("submits once through v2 with caller-supplied endpoints and wrapper-owned polling", async () => {
    const subscribe = vi.fn(async () => accepted);
    const adapter = createHiggsfieldSdkAdapter<Operations>({
      endpoints: { "episode.keyframe": endpoint },
      sdkClient: { subscribe } as HiggsfieldSdkClient,
    });

    await expect(adapter.submit("episode.keyframe", input, requestContext())).resolves.toEqual(accepted);
    expect(subscribe).toHaveBeenCalledOnce();
    expect(subscribe).toHaveBeenCalledWith(endpoint, { input, withPolling: false });
  });

  it("keeps authenticated status and cancellation on the hardened wrapper transport", async () => {
    const transport = new MockTransport();
    transport.enqueue(
      mockResponse({
        status: 200,
        body: JSON.stringify({
          ...accepted,
          status: "completed",
          images: [{ url: "https://cdn.example.com/keyframe.jpg" }],
        }),
        headers: { "x-correlation-id": "corr-status" },
      }),
      mockResponse({ status: 202, headers: { "x-correlation-id": "corr-cancel" } }),
    );
    const adapter = createHiggsfieldSdkAdapter<Operations>({
      endpoints: { "episode.keyframe": endpoint },
      sdkClient: { subscribe: async () => accepted },
    });
    const context = requestContext(transport);

    await expect(adapter.status(accepted.status_url, context)).resolves.toMatchObject({
      status: "completed",
      correlationId: "corr-status",
    });
    await expect(adapter.cancel(accepted.cancel_url, context)).resolves.toEqual({
      statusCode: 202,
      correlationId: "corr-cancel",
    });
    expect(transport.requests.map(({ method, url, headers }) => ({ method, url, headers }))).toEqual([
      {
        method: "GET",
        url: accepted.status_url,
        headers: {
          Accept: "application/json",
          Authorization: "Key key:secret",
          "User-Agent": "dramatic-higgsfield/0.1",
        },
      },
      {
        method: "POST",
        url: accepted.cancel_url,
        headers: {
          Authorization: "Key key:secret",
          "User-Agent": "dramatic-higgsfield/0.1",
        },
      },
    ]);
  });

  it("composes the injected SDK with handles, status mapping, and cancellation", async () => {
    const transport = new MockTransport();
    transport.enqueue(
      mockResponse({
        status: 200,
        body: JSON.stringify({
          ...accepted,
          status: "completed",
          video: { url: "https://cdn.example.com/episode.mp4" },
        }),
      }),
      mockResponse({ status: 202 }),
    );
    const client = createSdkBackedHiggsfieldClient<Operations>({
      endpoints: { "episode.keyframe": endpoint },
      sdkClient: { subscribe: async () => accepted },
      env: { HF_CREDENTIALS: "key:secret" },
      config: { userAgent: "dramatic-worker/2026.8" },
      transport,
      runtime: { now: () => new Date("2026-08-26T00:00:00.000Z") },
    });

    const handle = await client.submit("episode.keyframe", input);
    expect(handle).toMatchObject({ id: "request-1", operation: "episode.keyframe" });
    await expect(client.get(handle)).resolves.toMatchObject({
      status: "completed",
      artifacts: [{ kind: "video", url: "https://cdn.example.com/episode.mp4" }],
    });
    await expect(client.cancel(handle)).resolves.toMatchObject({ outcome: "accepted" });
    expect(transport.requests.map(request => request.headers?.["User-Agent"])).toEqual([
      "dramatic-worker/2026.8",
      "dramatic-worker/2026.8",
    ]);
  });

  it("rejects absolute or traversal endpoint bindings", () => {
    const sdkClient = { subscribe: async () => accepted };
    expect(() => createHiggsfieldSdkAdapter<Operations>({
      endpoints: { "episode.keyframe": "https://attacker.example/generate" },
      sdkClient,
    })).toThrow(ConfigurationError);
    expect(() => createHiggsfieldSdkAdapter<Operations>({
      endpoints: { "episode.keyframe": "../generate" },
      sdkClient,
    })).toThrow(ConfigurationError);
  });

  it("classifies opaque SDK network failures as ambiguous submissions", async () => {
    const client = createSdkBackedHiggsfieldClient<Operations>({
      endpoints: { "episode.keyframe": endpoint },
      sdkClient: {
        subscribe: async () => {
          throw Object.assign(new Error("socket closed"), { isAxiosError: true });
        },
      },
      env: { HF_CREDENTIALS: "key:secret" },
      transport: new MockTransport(),
    });

    await expect(client.submit("episode.keyframe", input)).rejects.toBeInstanceOf(
      AmbiguousSubmissionError,
    );
  });

  it("uses the installed official SDK and never retries a generation POST", async () => {
    let requests = 0;
    let authorization: string | undefined;
    let userAgent: string | undefined;
    let requestBody = "";
    const server = createServer((request, response) => {
      requests += 1;
      authorization = request.headers.authorization;
      userAgent = request.headers["user-agent"];
      request.setEncoding("utf8");
      request.on("data", (chunk: string) => { requestBody += chunk; });
      request.on("end", () => {
        response.writeHead(503, { "content-type": "application/json" });
        response.end(JSON.stringify({ detail: "temporarily unavailable" }));
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });

    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Expected a TCP test server.");
      const client = createSdkBackedHiggsfieldClient<Operations>({
        endpoints: { "episode.keyframe": endpoint },
        env: { HF_CREDENTIALS: "key:secret" },
        config: { baseUrl: new URL(`http://127.0.0.1:${address.port}`) },
        transport: new MockTransport(),
      });

      await expect(client.submit("episode.keyframe", input)).rejects.toMatchObject({
        code: "ambiguous_submission",
        cause: { code: "temporarily_unavailable" },
      });
      expect(requests).toBe(1);
      expect(authorization).toBe("Key key:secret");
      expect(userAgent).toBe("higgsfield-server-js/2.0");
      expect(JSON.parse(requestBody)).toEqual(input);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});

function requestContext(transport = new MockTransport()) {
  return {
    baseUrl: new URL("https://platform.higgsfield.ai"),
    authorization: "Key key:secret",
    requestTimeoutMs: 30_000,
    userAgent: "dramatic-higgsfield/0.1",
    transport,
  };
}
