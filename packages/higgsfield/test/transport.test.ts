import { describe, expect, it } from "vitest";

import {
  AbortedError,
  FetchTransport,
  ProtocolError,
  TransportError,
  assertSafeDownloadUrl,
  resolveSafeDownloadTarget,
  type HostResolver,
} from "../src/index.js";

describe("fetch transport and URL policy", () => {
  it("does not dispatch an already-aborted request", async () => {
    let calls = 0;
    const transport = new FetchTransport(async () => {
      calls += 1;
      return new Response();
    });
    const controller = new AbortController();
    controller.abort("stop");
    await expect(
      transport.send({ method: "GET", url: "https://example.com", timeoutMs: 100, signal: controller.signal }),
    ).rejects.toBeInstanceOf(AbortedError);
    expect(calls).toBe(0);
  });

  it("classifies fetch failures conservatively as possibly sent", async () => {
    const transport = new FetchTransport(async () => { throw new Error("connection reset"); });
    const error = await transport
      .send({ method: "POST", url: "https://example.com", timeoutMs: 100 })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TransportError);
    expect((error as TransportError).dispatchState).toBe("possibly_sent");
  });

  it("refuses pinned requests rather than silently performing a second DNS lookup", async () => {
    const transport = new FetchTransport(async () => new Response());
    const error = await transport.send({
      method: "GET",
      url: "https://example.com/file",
      timeoutMs: 100,
      connectAddress: { address: "93.184.216.34", family: 4 },
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TransportError);
    expect((error as TransportError).dispatchState).toBe("not_sent");
  });

  it("rejects local, private, credentialed, and non-HTTPS artifact URLs", () => {
    expect(() => assertSafeDownloadUrl("http://example.com/file")).toThrow();
    expect(() => assertSafeDownloadUrl("https://localhost/file")).toThrow();
    expect(() => assertSafeDownloadUrl("https://192.168.1.10/file")).toThrow();
    expect(() => assertSafeDownloadUrl("https://user:pass@example.com/file")).toThrow();
    expect(assertSafeDownloadUrl("https://cdn.example.com/file").hostname).toBe("cdn.example.com");
  });

  it("rejects IPv4-mapped IPv6 literals", () => {
    expect(() => assertSafeDownloadUrl("https://[::ffff:127.0.0.1]/metadata")).toThrow(ProtocolError);
    expect(() => assertSafeDownloadUrl("https://[::ffff:c0a8:0101]/metadata")).toThrow(ProtocolError);
  });

  it.each([
    ["private", { address: "10.0.0.8", family: 4 as const }],
    ["link-local", { address: "169.254.169.254", family: 4 as const }],
    ["reserved", { address: "192.0.2.10", family: 4 as const }],
    ["IPv6 loopback", { address: "::1", family: 6 as const }],
    ["IPv6 link-local", { address: "fe80::1", family: 6 as const }],
    ["IPv6 documentation", { address: "2001:db8::1", family: 6 as const }],
    ["mapped IPv6", { address: "::ffff:7f00:1", family: 6 as const }],
  ])("rejects DNS resolution to a %s address", async (_label, answer) => {
    const resolver: HostResolver = { resolve: async () => [answer] };
    await expect(resolveSafeDownloadTarget("https://cdn.example.com/file", resolver)).rejects.toThrow(ProtocolError);
  });

  it("rejects a mixed DNS answer set and pins an all-public answer set", async () => {
    const mixed: HostResolver = {
      resolve: async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ],
    };
    await expect(resolveSafeDownloadTarget("https://cdn.example.com/file", mixed)).rejects.toThrow(ProtocolError);

    const publicOnly: HostResolver = {
      resolve: async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
      ],
    };
    await expect(resolveSafeDownloadTarget("https://cdn.example.com/file", publicOnly)).resolves.toMatchObject({
      addresses: [
        { address: "93.184.216.34", family: 4 },
        { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
      ],
    });
  });
});
