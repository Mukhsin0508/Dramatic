import "server-only";

/**
 * The sole application-facing entry point for Higgsfield generation.
 *
 * Route handlers and workers import from this file, while the mobile client
 * only talks to Dramatic's own API. The concrete operation map will be added
 * behind this boundary when the authoritative OpenAPI document arrives.
 */
export type {
  CreateHiggsfieldClientOptions,
  GenerationClient,
  GenerationHooks,
  HiggsfieldSchemaAdapter,
  OperationMap,
  OperationName,
  OperationSpec,
} from "@dramatic/higgsfield";
export { createHiggsfieldClient } from "@dramatic/higgsfield";
