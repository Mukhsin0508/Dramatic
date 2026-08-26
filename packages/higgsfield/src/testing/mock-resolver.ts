import type { HostResolver, ResolvedHostAddress } from "../url-policy.js";

export class MockHostResolver implements HostResolver {
  readonly requests: string[] = [];
  readonly #answers: ReadonlyMap<string, readonly ResolvedHostAddress[]>;

  constructor(answers: Readonly<Record<string, readonly ResolvedHostAddress[]>> = {}) {
    this.#answers = new Map(Object.entries(answers));
  }

  async resolve(hostname: string, signal?: AbortSignal): Promise<readonly ResolvedHostAddress[]> {
    if (signal?.aborted) throw signal.reason;
    this.requests.push(hostname);
    return this.#answers.get(hostname) ?? [{ address: "93.184.216.34", family: 4 }];
  }
}
