import { z } from "zod";
import { EntityIdSchema, IsoDateTimeSchema } from "./common.js";

export const VoteOptionSchema = z.object({
  id: EntityIdSchema,
  label: z.string().min(2).max(80),
  consequence: z.string().min(10).max(500),
  generationDirective: z.string().min(10).max(1_000),
}).strict();

export const VotePromptSchema = z
  .object({
    id: EntityIdSchema,
    question: z.string().min(8).max(180),
    options: z.array(VoteOptionSchema).min(2).max(3),
  })
  .strict()
  .superRefine(({ options }, context) => {
    const ids = new Set(options.map(({ id }) => id));
    if (ids.size !== options.length) {
      context.addIssue({ code: "custom", message: "Vote option IDs must be unique", path: ["options"] });
    }
  });

export const VoteWindowSchema = z
  .object({
    id: EntityIdSchema,
    seriesId: EntityIdSchema,
    episodeId: EntityIdSchema,
    status: z.enum(["scheduled", "open", "closed", "applied", "cancelled"]),
    prompt: VotePromptSchema,
    opensAt: IsoDateTimeSchema,
    closesAt: IsoDateTimeSchema,
  })
  .strict()
  .superRefine(({ opensAt, closesAt }, context) => {
    if (Date.parse(closesAt) <= Date.parse(opensAt)) {
      context.addIssue({ code: "custom", message: "closesAt must be after opensAt", path: ["closesAt"] });
    }
  });

export const VoteTallySchema = z
  .object({
    voteId: EntityIdSchema,
    totalVotes: z.int().nonnegative(),
    options: z.array(
      z.object({
        optionId: EntityIdSchema,
        votes: z.int().nonnegative(),
      }).strict(),
    ),
    computedAt: IsoDateTimeSchema,
  })
  .strict()
  .superRefine(({ totalVotes, options }, context) => {
    const optionIds = new Set(options.map(({ optionId }) => optionId));
    if (optionIds.size !== options.length) {
      context.addIssue({ code: "custom", message: "Tally option IDs must be unique", path: ["options"] });
    }
    const countedVotes = options.reduce((sum, option) => sum + option.votes, 0);
    if (countedVotes !== totalVotes) {
      context.addIssue({ code: "custom", message: "Option votes must sum to totalVotes", path: ["totalVotes"] });
    }
  });

export type VoteOption = z.infer<typeof VoteOptionSchema>;
export type VotePrompt = z.infer<typeof VotePromptSchema>;
export type VoteWindow = z.infer<typeof VoteWindowSchema>;
export type VoteTally = z.infer<typeof VoteTallySchema>;
