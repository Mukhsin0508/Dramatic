import { z } from "zod";
import { AssetSchema, EntityIdSchema, IsoDateTimeSchema } from "./common.js";

export const CostLineItemSchema = z.object({
  category: z.enum(["video", "audio", "image", "tokens", "storage", "other"]),
  description: z.string().min(2).max(160),
  quantity: z.number().positive(),
  unit: z.string().min(1).max(40),
  amountMinor: z.int().nonnegative(),
});

export const CostMetadataSchema = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/),
  estimatedAmountMinor: z.int().nonnegative().optional(),
  finalAmountMinor: z.int().nonnegative().optional(),
  lineItems: z.array(CostLineItemSchema).max(20).default([]),
});

export const GenerationRequestSchema = z.object({
  requestId: EntityIdSchema.optional(),
  seriesId: EntityIdSchema,
  episodeId: EntityIdSchema.optional(),
  prompt: z.string().min(40).max(5_000),
  durationSeconds: z.int().min(3).max(180),
  aspectRatio: z.literal("9:16").default("9:16"),
  seed: z.int().nonnegative().optional(),
  sourceAssetUrls: z.array(z.url()).max(12).default([]),
  metadata: z.record(z.string(), z.string()).default({}),
});

export const GenerationStatusSchema = z.enum([
  "queued",
  "submitted",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);

export const GenerationErrorSchema = z.object({
  code: z.string().min(2).max(80),
  message: z.string().min(2).max(1_000),
  retryable: z.boolean(),
});

export const GenerationOutputSchema = z.object({
  video: AssetSchema,
  poster: AssetSchema.optional(),
  durationSeconds: z.number().positive(),
  mimeType: z.string().regex(/^video\//),
});

export const GenerationJobSchema = z
  .object({
    id: EntityIdSchema,
    requestId: EntityIdSchema.optional(),
    seriesId: EntityIdSchema,
    episodeId: EntityIdSchema.optional(),
    status: GenerationStatusSchema,
    progress: z.number().min(0).max(1),
    provider: z.string().min(2).max(80).optional(),
    providerReference: z.string().min(1).max(300).optional(),
    cost: CostMetadataSchema.optional(),
    output: GenerationOutputSchema.optional(),
    error: GenerationErrorSchema.optional(),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .superRefine((job, context) => {
    if (job.status === "succeeded" && !job.output) {
      context.addIssue({ code: "custom", message: "Successful jobs require output", path: ["output"] });
    }
    if (job.status === "failed" && !job.error) {
      context.addIssue({ code: "custom", message: "Failed jobs require an error", path: ["error"] });
    }
    if (job.status === "succeeded" && job.progress !== 1) {
      context.addIssue({ code: "custom", message: "Successful jobs must have progress 1", path: ["progress"] });
    }
    if (Date.parse(job.updatedAt) < Date.parse(job.createdAt)) {
      context.addIssue({ code: "custom", message: "updatedAt cannot precede createdAt", path: ["updatedAt"] });
    }
  });

export type CostLineItem = z.infer<typeof CostLineItemSchema>;
export type CostMetadata = z.infer<typeof CostMetadataSchema>;
export type GenerationRequest = z.infer<typeof GenerationRequestSchema>;
export type GenerationStatus = z.infer<typeof GenerationStatusSchema>;
export type GenerationError = z.infer<typeof GenerationErrorSchema>;
export type GenerationOutput = z.infer<typeof GenerationOutputSchema>;
export type GenerationJob = z.infer<typeof GenerationJobSchema>;
