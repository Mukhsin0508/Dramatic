import { createHash } from "node:crypto";

import { GenerationClientError } from "./errors.js";

export function submissionFingerprint(operation: string, input: unknown): string {
  const canonical = canonicalize(input);
  return createHash("sha256").update(operation).update("\u0000").update(canonical).digest("hex");
}

export function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw invalidInput("Input numbers must be finite.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const prototype = Object.getPrototypeOf(record) as object | null;
    if (prototype !== Object.prototype && prototype !== null) {
      throw invalidInput("Generation input must contain only plain JSON objects.");
    }
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
      .join(",")}}`;
  }
  throw invalidInput("Generation input must be JSON serializable.");
}

function invalidInput(message: string): GenerationClientError {
  return new GenerationClientError(message, { code: "invalid_input" });
}
