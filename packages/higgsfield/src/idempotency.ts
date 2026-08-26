import type { GenerationHandle } from "./contracts.js";

export interface IdempotencyRecord {
  readonly scope: string;
  readonly key: string;
  readonly fingerprint: string;
  readonly expiresAt: string;
}

export type IdempotencyClaim =
  | { readonly state: "acquired"; readonly leaseId: string }
  | { readonly state: "replay"; readonly handle: GenerationHandle }
  | { readonly state: "in_flight" }
  | { readonly state: "ambiguous" }
  | { readonly state: "conflict" };

export interface IdempotencyStore {
  claim(record: IdempotencyRecord): Promise<IdempotencyClaim>;
  markAccepted(leaseId: string, handle: GenerationHandle): Promise<void>;
  markAmbiguous(leaseId: string, observedAt: string): Promise<void>;
  release(leaseId: string): Promise<void>;
}

type StoredEntry =
  | { readonly state: "in_flight"; readonly record: IdempotencyRecord; readonly leaseId: string }
  | { readonly state: "accepted"; readonly record: IdempotencyRecord; readonly handle: GenerationHandle }
  | { readonly state: "ambiguous"; readonly record: IdempotencyRecord; readonly observedAt: string };

/** Deterministic process-local implementation for development and tests only. */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  readonly #entries = new Map<string, StoredEntry>();
  readonly #leases = new Map<string, string>();
  readonly #now: () => Date;
  #sequence = 0;

  constructor(now: () => Date = () => new Date()) {
    this.#now = now;
  }

  async claim(record: IdempotencyRecord): Promise<IdempotencyClaim> {
    const storageKey = `${record.scope}\u0000${record.key}`;
    const existing = this.#entries.get(storageKey);
    if (existing && Date.parse(existing.record.expiresAt) <= this.#now().getTime()) {
      this.#entries.delete(storageKey);
    } else if (existing) {
      if (existing.record.fingerprint !== record.fingerprint) return { state: "conflict" };
      if (existing.state === "accepted") return { state: "replay", handle: existing.handle };
      if (existing.state === "ambiguous") return { state: "ambiguous" };
      return { state: "in_flight" };
    }

    const leaseId = `lease-${++this.#sequence}`;
    this.#entries.set(storageKey, { state: "in_flight", record, leaseId });
    this.#leases.set(leaseId, storageKey);
    return { state: "acquired", leaseId };
  }

  async markAccepted(leaseId: string, handle: GenerationHandle): Promise<void> {
    const [storageKey, entry] = this.#entryForLease(leaseId);
    this.#entries.set(storageKey, { state: "accepted", record: entry.record, handle });
    this.#leases.delete(leaseId);
  }

  async markAmbiguous(leaseId: string, observedAt: string): Promise<void> {
    const [storageKey, entry] = this.#entryForLease(leaseId);
    this.#entries.set(storageKey, { state: "ambiguous", record: entry.record, observedAt });
    this.#leases.delete(leaseId);
  }

  async release(leaseId: string): Promise<void> {
    const storageKey = this.#leases.get(leaseId);
    if (!storageKey) return;
    this.#entries.delete(storageKey);
    this.#leases.delete(leaseId);
  }

  #entryForLease(leaseId: string): [string, Extract<StoredEntry, { state: "in_flight" }>] {
    const storageKey = this.#leases.get(leaseId);
    const entry = storageKey ? this.#entries.get(storageKey) : undefined;
    if (!storageKey || entry?.state !== "in_flight" || entry.leaseId !== leaseId) {
      throw new Error("Unknown or completed idempotency lease.");
    }
    return [storageKey, entry];
  }
}
