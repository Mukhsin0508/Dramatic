import { describe, expect, it } from "vitest";

import {
  HiggsfieldProvider,
  ProtocolError,
  loadHiggsfieldConfig,
  type HiggsfieldAcceptedEnvelope,
  type HiggsfieldSchemaAdapter,
  type OperationMap,
} from "../src/index.js";
import { MockTransport } from "../src/testing/index.js";

type Operations = {
  readonly "fixture.image": { readonly input: { readonly prompt: string } };
};

function adapter(overrides: Partial<HiggsfieldSchemaAdapter<Operations>> = {}): HiggsfieldSchemaAdapter<Operations> {
  const accepted: HiggsfieldAcceptedEnvelope = {
    status: "queued",
    request_id: "request-1",
    status_url: "https://platform.higgsfield.ai/opaque/status",
    cancel_url: "https://platform.higgsfield.ai/opaque/cancel",
    correlationId: "correlation-1",
  };
  return {
    async submit() { return accepted; },
    async estimate() { return { credits: "1.500", usd: "0.094" }; },
    async status() { return { ...accepted, status: "completed", images: [{ url: "https://cdn.example.com/result.jpg" }] }; },
    async cancel() { return { statusCode: 202 }; },
    ...overrides,
  } as HiggsfieldSchemaAdapter<Operations>;
}

function provider(schema = adapter()): HiggsfieldProvider<Operations> {
  return new HiggsfieldProvider({
    schema,
    config: loadHiggsfieldConfig({ HIGGSFIELD_API_KEY: "key:secret" }),
    transport: new MockTransport(),
    now: () => new Date("2026-08-26T00:00:00.000Z"),
  });
}

describe("Higgsfield provider mapping", () => {
  it("preserves returned control URLs and correlation IDs", async () => {
    const result = await provider().submit("fixture.image", { prompt: "hello" }, {});
    expect(result.handle).toMatchObject({
      provider: "higgsfield",
      id: "request-1",
      statusToken: "https://platform.higgsfield.ai/opaque/status",
      cancelToken: "https://platform.higgsfield.ai/opaque/cancel",
      correlationId: "correlation-1",
    });
  });

  it("rejects untrusted control URLs instead of constructing its own", async () => {
    const schema = adapter({
      async submit() {
        return {
          status: "queued",
          request_id: "request-1",
          status_url: "https://attacker.example/status",
        };
      },
    });
    await expect(provider(schema).submit("fixture.image", { prompt: "hello" }, {})).rejects.toThrow(
      /untrusted control URL/u,
    );
  });

  it("keeps dev credentials inside the dev control-origin boundary", async () => {
    const devAccepted: HiggsfieldAcceptedEnvelope = {
      status: "queued",
      request_id: "request-dev",
      status_url: "https://dev-api.higgsfield.com/requests/request-dev/status",
      cancel_url: "https://dev-api.higgsfield.com/requests/request-dev/cancel",
    };
    const devProvider = new HiggsfieldProvider<Operations>({
      schema: adapter({ async submit() { return devAccepted; } }),
      config: loadHiggsfieldConfig({
        HIGGSFIELD_API_KEY: "key:secret",
        HF_API_BASE: "https://dev-api.higgsfield.com",
      }),
      transport: new MockTransport(),
    });

    await expect(
      devProvider.submit("fixture.image", { prompt: "hello" }, {}),
    ).resolves.toMatchObject({
      handle: {
        statusToken: devAccepted.status_url,
        cancelToken: devAccepted.cancel_url,
      },
    });

    const wrongEnvironment = adapter({
      async submit() {
        return {
          ...devAccepted,
          status_url: "https://platform.higgsfield.ai/requests/request-dev/status",
        };
      },
    });
    const mismatchedProvider = new HiggsfieldProvider<Operations>({
      schema: wrongEnvironment,
      config: loadHiggsfieldConfig({
        HIGGSFIELD_API_KEY: "key:secret",
        HF_API_BASE: "https://dev-api.higgsfield.com",
      }),
      transport: new MockTransport(),
    });
    await expect(
      mismatchedProvider.submit("fixture.image", { prompt: "hello" }, {}),
    ).rejects.toThrow(/untrusted control URL/u);
  });

  it("normalizes completed artifacts and NSFW status", async () => {
    const created = await provider().submit("fixture.image", { prompt: "hello" }, {});
    const completed = await provider().status(created.handle, {});
    expect(completed.status).toBe("completed");
    if (completed.status === "completed") {
      expect(completed.artifacts).toEqual([
        {
          id: "request-1:0",
          kind: "image",
          url: "https://cdn.example.com/result.jpg",
        },
      ]);
    }

    const moderatedProvider = provider(adapter({
      async status() {
        return { status: "nsfw", request_id: "request-1", status_url: "https://platform.higgsfield.ai/opaque/status" };
      },
    }));
    const moderated = await moderatedProvider.status(created.handle, {});
    expect(moderated.status).toBe("moderated");
  });

  it("rejects unknown statuses and request ID mismatches", async () => {
    const created = await provider().submit("fixture.image", { prompt: "hello" }, {});
    await expect(
      provider(adapter({ async status() { return { status: "future", request_id: "request-1", status_url: created.handle.statusToken }; } })).status(created.handle, {}),
    ).rejects.toBeInstanceOf(ProtocolError);
    await expect(
      provider(adapter({ async status() { return { status: "queued", request_id: "other", status_url: created.handle.statusToken }; } })).status(created.handle, {}),
    ).rejects.toThrow(/request ID/u);
  });

  it("preserves estimate decimal strings and maps cancellation semantics", async () => {
    const instance = provider();
    const estimate = await instance.estimate("fixture.image", { prompt: "hello" }, {});
    expect(estimate.credits).toBe("1.500");
    expect(estimate.money?.amount).toBe("0.094");
    const created = await instance.submit("fixture.image", { prompt: "hello" }, {});
    expect(await instance.cancel(created.handle, {})).toMatchObject({ outcome: "accepted" });

    const tooLate = provider(adapter({ async cancel() { return { statusCode: 400 }; } }));
    expect(await tooLate.cancel(created.handle, {})).toMatchObject({ outcome: "too_late" });
  });

  it("reports estimation as unsupported when the supplied schema does not bind it", async () => {
    const schema = adapter();
    delete (schema as Partial<HiggsfieldSchemaAdapter<Operations>>).estimate;
    await expect(provider(schema).estimate("fixture.image", { prompt: "hello" }, {})).rejects.toMatchObject({
      code: "unsupported_capability",
    });
  });
});
