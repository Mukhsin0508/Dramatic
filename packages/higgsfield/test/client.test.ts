import { describe, expect, it } from "vitest";

import {
  AmbiguousSubmissionError,
  DefaultGenerationClient,
  GenerationClientError,
  IdempotencyConflictError,
  InMemoryIdempotencyStore,
  PollTimeoutError,
  TransportError,
  type GenerationProvider,
  type OperationMap,
} from "../src/index.js";
import { DeterministicMockProvider, MockTransport } from "../src/testing/index.js";

type Operations = {
  readonly "fixture.video": {
    readonly input: {
      readonly prompt: string;
      readonly metadata?: Readonly<Record<string, string>>;
    };
  };
};

function client(provider: GenerationProvider<Operations>, clock?: ReturnType<typeof fakeClock>) {
  return new DefaultGenerationClient({
    provider,
    idempotencyStore: new InMemoryIdempotencyStore(),
    downloadTransport: new MockTransport(),
    runtime: clock,
  });
}

function fakeClock() {
  let time = Date.parse("2026-08-26T00:00:00.000Z");
  const sleeps: number[] = [];
  return {
    sleeps,
    now: () => new Date(time),
    random: () => 0,
    sleep: async (milliseconds: number) => { sleeps.push(milliseconds); time += milliseconds; },
  };
}

describe("generation client", () => {
  it("deduplicates equal canonical input and rejects key reuse with different input", async () => {
    const provider = new DeterministicMockProvider<Operations>({
      "fixture.video": { statuses: ["queued", { status: "completed" }] },
    });
    const instance = client(provider);
    const options = { idempotency: { key: "episode-1", ttlMs: 60_000 } };
    const first = await instance.submit(
      "fixture.video",
      { prompt: "hello", metadata: { b: "2", a: "1" } },
      options,
    );
    const replay = await instance.submit(
      "fixture.video",
      { metadata: { a: "1", b: "2" }, prompt: "hello" },
      options,
    );
    expect(replay).toEqual(first);
    expect(provider.submissions).toHaveLength(1);
    await expect(
      instance.submit("fixture.video", { prompt: "different" }, options),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
  });

  it("marks possibly-sent submissions ambiguous and never auto-retries", async () => {
    let calls = 0;
    const provider = {
      name: "failing",
      async submit() { calls += 1; throw new TransportError("timeout", "possibly_sent"); },
      async estimate() { throw new Error("unused"); },
      async status() { throw new Error("unused"); },
      async cancel() { throw new Error("unused"); },
    } as unknown as GenerationProvider<Operations>;
    const instance = client(provider);
    const options = { idempotency: { key: "episode-1", ttlMs: 60_000 } };
    await expect(instance.submit("fixture.video", { prompt: "hello" }, options)).rejects.toBeInstanceOf(
      AmbiguousSubmissionError,
    );
    await expect(instance.submit("fixture.video", { prompt: "hello" }, options)).rejects.toBeInstanceOf(
      AmbiguousSubmissionError,
    );
    expect(calls).toBe(1);
  });

  it("classifies a possibly-sent submission as ambiguous without a local key", async () => {
    let calls = 0;
    const provider = {
      name: "failing",
      async submit() { calls += 1; throw new TransportError("timeout", "possibly_sent"); },
      async estimate() { throw new Error("unused"); },
      async status() { throw new Error("unused"); },
      async cancel() { throw new Error("unused"); },
    } as unknown as GenerationProvider<Operations>;
    await expect(client(provider).submit("fixture.video", { prompt: "hello" })).rejects.toBeInstanceOf(
      AmbiguousSubmissionError,
    );
    expect(calls).toBe(1);
  });

  it("polls with documented backoff and returns terminal snapshots", async () => {
    const clock = fakeClock();
    const provider = new DeterministicMockProvider<Operations>(
      { "fixture.video": { statuses: ["queued", "in_progress", { status: "completed" }] } },
      { now: clock.now },
    );
    const instance = client(provider, clock);
    const handle = await instance.submit("fixture.video", { prompt: "hello" });
    const terminal = await instance.wait(handle, { timeoutMs: 30_000 });
    expect(terminal.status).toBe("completed");
    expect(clock.sleeps).toEqual([2_000, 3_000]);
    expect(terminal.timing.pollCount).toBe(2);
  });

  it("times out locally without canceling remote work", async () => {
    const clock = fakeClock();
    const provider = new DeterministicMockProvider<Operations>(
      { "fixture.video": { statuses: ["queued"] } },
      { now: clock.now },
    );
    const instance = client(provider, clock);
    const handle = await instance.submit("fixture.video", { prompt: "hello" });
    await expect(instance.wait(handle, { timeoutMs: 1_000 })).rejects.toBeInstanceOf(PollTimeoutError);
    expect(clock.sleeps).toEqual([1_000]);
    expect((await instance.cancel(handle)).outcome).toBe("accepted");
  });

  it("retries retryable status failures but not permanent failures", async () => {
    const clock = fakeClock();
    const delegate = new DeterministicMockProvider<Operations>(
      { "fixture.video": { statuses: ["queued", { status: "completed" }] } },
      { now: clock.now },
    );
    let failures = 1;
    const retries: number[] = [];
    const flaky = {
      name: delegate.name,
      estimate: delegate.estimate.bind(delegate),
      submit: delegate.submit.bind(delegate),
      cancel: delegate.cancel.bind(delegate),
      async status(...args: Parameters<typeof delegate.status>) {
        if (failures-- > 0) {
          throw new GenerationClientError("temporary", {
            code: "temporarily_unavailable",
            retryable: true,
          });
        }
        return delegate.status(...args);
      },
    } as GenerationProvider<Operations>;
    const instance = client(flaky, clock);
    const handle = await instance.submit("fixture.video", { prompt: "hello" });
    await expect(
      instance.wait(handle, {
        timeoutMs: 30_000,
        onRetry: (event) => { retries.push(event.attempt); },
      }),
    ).resolves.toMatchObject({ status: "completed" });
    expect(retries).toEqual([1]);

    const permanent = {
      ...flaky,
      async status() {
        throw new GenerationClientError("bad auth", { code: "authentication" });
      },
    } as GenerationProvider<Operations>;
    await expect(client(permanent, clock).wait(handle, { timeoutMs: 30_000 })).rejects.toMatchObject({
      code: "authentication",
    });
  });

  it("isolates hook failures", async () => {
    const provider = new DeterministicMockProvider<Operations>({ "fixture.video": {} });
    const instance = new DefaultGenerationClient<Operations>({
      provider,
      idempotencyStore: new InMemoryIdempotencyStore(),
      downloadTransport: new MockTransport(),
      hooks: { onAccepted: () => { throw new Error("telemetry offline"); } },
    });
    await expect(instance.submit("fixture.video", { prompt: "hello" })).resolves.toMatchObject({ id: "mock-1" });
  });
});
