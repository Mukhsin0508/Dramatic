import { describe, expect, it } from "vitest";

import {
  DefaultGenerationClient,
  DownloadError,
  InMemoryIdempotencyStore,
  IntegrityError,
  ProtocolError,
  type ArtifactSink,
  type GenerationProvider,
  type MediaArtifact,
} from "../src/index.js";
import { DeterministicMockProvider, MockHostResolver, MockTransport, mockResponse } from "../src/testing/index.js";

type Operations = { readonly fixture: { readonly input: Record<string, never> } };
const provider = new DeterministicMockProvider<Operations>({ fixture: {} });
const artifact: MediaArtifact = { id: "a-1", kind: "video", url: "https://cdn.example.com/video.mp4" };

function sink(bytes: number[]): ArtifactSink {
  return {
    async consume(chunks) {
      for await (const chunk of chunks) bytes.push(...chunk);
      return { location: "object://bucket/video.mp4" };
    },
  };
}

function create(transport: MockTransport, hostResolver = new MockHostResolver()) {
  return new DefaultGenerationClient({
    provider: provider as GenerationProvider<Operations>,
    idempotencyStore: new InMemoryIdempotencyStore(),
    downloadTransport: transport,
    hostResolver,
  });
}

describe("artifact downloads", () => {
  it("streams to a sink, hashes bytes, and reports monotonic progress", async () => {
    const transport = new MockTransport([
      mockResponse({ status: 200, headers: { "content-length": "3", "content-type": "video/mp4" }, body: new Uint8Array([1, 2, 3]) }),
    ]);
    const bytes: number[] = [];
    const progress: number[] = [];
    const receipt = await create(transport).download(artifact, sink(bytes), {
      maxBytes: 10,
      onProgress: (event) => { progress.push(event.bytesReceived); },
    });
    expect(bytes).toEqual([1, 2, 3]);
    expect(receipt).toMatchObject({ location: "object://bucket/video.mp4", bytesWritten: 3, contentType: "video/mp4" });
    expect(receipt.sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(progress).toEqual([3]);
    expect(transport.requests[0]?.connectAddress).toEqual({ address: "93.184.216.34", family: 4 });
  });

  it("enforces declared and streaming byte limits", async () => {
    await expect(
      create(new MockTransport([mockResponse({ headers: { "content-length": "11" }, body: "small" })])).download(
        artifact,
        sink([]),
        { maxBytes: 10 },
      ),
    ).rejects.toBeInstanceOf(DownloadError);

    await expect(
      create(new MockTransport([mockResponse({ body: "elevenbytes" })])).download(artifact, sink([]), { maxBytes: 10 }),
    ).rejects.toBeInstanceOf(DownloadError);
  });

  it("checks integrity and validates every redirect target", async () => {
    await expect(
      create(new MockTransport([mockResponse({ body: "hello" })])).download(artifact, sink([]), {
        maxBytes: 10,
        expectedSha256: "0".repeat(64),
      }),
    ).rejects.toBeInstanceOf(IntegrityError);

    await expect(
      create(new MockTransport([
        mockResponse({ status: 302, headers: { location: "http://127.0.0.1/metadata" } }),
      ])).download(artifact, sink([]), { maxBytes: 10 }),
    ).rejects.toBeInstanceOf(ProtocolError);
  });

  it("resolves and pins every HTTPS redirect independently", async () => {
    const transport = new MockTransport([
      mockResponse({ status: 302, headers: { location: "https://assets.example.net/final.mp4" } }),
      mockResponse({ body: "ok" }),
    ]);
    const resolver = new MockHostResolver({
      "cdn.example.com": [{ address: "1.1.1.1", family: 4 }],
      "assets.example.net": [{ address: "8.8.8.8", family: 4 }],
    });

    await create(transport, resolver).download(artifact, sink([]), { maxBytes: 10 });

    expect(resolver.requests).toEqual(["cdn.example.com", "assets.example.net"]);
    expect(transport.requests.map((request) => request.connectAddress)).toEqual([
      { address: "1.1.1.1", family: 4 },
      { address: "8.8.8.8", family: 4 },
    ]);
  });
});
