import type {
  CancelResult,
  CostEstimate,
  DecimalString,
  GenerationHandle,
  GenerationSnapshot,
  MediaArtifact,
  OperationMap,
  OperationName,
} from "../contracts.js";
import { GenerationClientError } from "../errors.js";
import type { GenerationProvider, ProviderAccepted, ProviderCallContext } from "../provider.js";

export type MockTerminal =
  | { readonly status: "completed"; readonly artifacts?: readonly MediaArtifact[] }
  | { readonly status: "failed"; readonly message?: string }
  | { readonly status: "moderated" }
  | { readonly status: "canceled" };

export interface MockScenario {
  readonly statuses?: readonly ("queued" | "in_progress" | MockTerminal)[];
  readonly credits?: string;
  readonly usd?: string;
}

interface MockJob {
  readonly handle: GenerationHandle;
  readonly statuses: ("queued" | "in_progress" | MockTerminal)[];
  index: number;
  canceled: boolean;
}

/** Scripted provider with deterministic IDs and one status advance per poll. */
export class DeterministicMockProvider<Operations extends OperationMap>
  implements GenerationProvider<Operations>
{
  readonly name = "mock";
  readonly submissions: { readonly operation: string; readonly input: unknown }[] = [];
  readonly #scenarios: Readonly<Partial<Record<OperationName<Operations>, MockScenario>>>;
  readonly #jobs = new Map<string, MockJob>();
  readonly #now: () => Date;
  #sequence = 0;

  constructor(
    scenarios: Readonly<Partial<Record<OperationName<Operations>, MockScenario>>>,
    options: { readonly now?: () => Date } = {},
  ) {
    this.#scenarios = scenarios;
    this.#now = options.now ?? (() => new Date());
  }

  async estimate<Operation extends OperationName<Operations>>(
    operation: Operation,
    _input: Operations[Operation]["input"],
    _context: ProviderCallContext,
  ): Promise<CostEstimate> {
    const scenario = this.#scenario(operation);
    return {
      ...(scenario.credits ? { credits: scenario.credits as DecimalString } : {}),
      ...(scenario.usd ? { money: { currency: "USD", amount: scenario.usd as DecimalString } as const } : {}),
      observedAt: this.#now().toISOString(),
    };
  }

  async submit<Operation extends OperationName<Operations>>(
    operation: Operation,
    input: Operations[Operation]["input"],
    _context: ProviderCallContext,
  ): Promise<ProviderAccepted<Operation>> {
    const scenario = this.#scenario(operation);
    const id = `mock-${++this.#sequence}`;
    const acceptedAt = this.#now().toISOString();
    const handle: GenerationHandle<Operation> = {
      provider: this.name,
      operation,
      id,
      statusToken: id,
      cancelToken: id,
      acceptedAt,
    };
    const statuses = [...(scenario.statuses ?? ["queued", { status: "completed" } as const])];
    this.#jobs.set(id, { handle, statuses, index: 0, canceled: false });
    this.submissions.push({ operation, input });
    return { handle, initial: this.#snapshot(handle, statuses[0] ?? "queued", 0) };
  }

  async status<Operation extends OperationName<Operations>>(
    handle: GenerationHandle<Operation>,
    _context: ProviderCallContext,
  ): Promise<GenerationSnapshot<Operation>> {
    const job = this.#jobs.get(handle.id);
    if (!job) throw new GenerationClientError("Mock job not found.", { code: "not_found" });
    if (job.canceled) return this.#snapshot(handle, { status: "canceled" }, job.index);
    job.index = Math.min(job.index + 1, job.statuses.length - 1);
    return this.#snapshot(handle, job.statuses[job.index] ?? "queued", job.index);
  }

  async cancel<Operation extends OperationName<Operations>>(
    handle: GenerationHandle<Operation>,
    _context: ProviderCallContext,
  ): Promise<CancelResult> {
    const job = this.#jobs.get(handle.id);
    if (!job) throw new GenerationClientError("Mock job not found.", { code: "not_found" });
    const current = job.statuses[job.index];
    if (current === "queued") {
      job.canceled = true;
      return { outcome: "accepted", observedAt: this.#now().toISOString() };
    }
    return { outcome: "too_late", observedAt: this.#now().toISOString() };
  }

  #scenario(operation: OperationName<Operations>): MockScenario {
    const scenario = this.#scenarios[operation];
    if (!scenario) throw new GenerationClientError(`No mock scenario for ${operation}.`, { code: "invalid_input" });
    return scenario;
  }

  #snapshot<Operation extends string>(
    handle: GenerationHandle<Operation>,
    scripted: "queued" | "in_progress" | MockTerminal,
    pollCount: number,
  ): GenerationSnapshot<Operation> {
    const observed = this.#now().toISOString();
    const common = { handle, timing: { acceptedAt: handle.acceptedAt, lastObservedAt: observed, pollCount } };
    if (scripted === "queued" || scripted === "in_progress") return { ...common, status: scripted, artifacts: [] };
    if (scripted.status === "completed") return { ...common, status: "completed", artifacts: scripted.artifacts ?? [] };
    if (scripted.status === "failed") {
      return { ...common, status: "failed", artifacts: [], failure: { kind: "provider", ...(scripted.message ? { message: scripted.message } : {}) } };
    }
    if (scripted.status === "moderated") return { ...common, status: "moderated", artifacts: [], failure: { kind: "moderated" } };
    return { ...common, status: "canceled", artifacts: [], failure: { kind: "canceled" } };
  }
}
