import { z } from "zod";
import { AssetSchema, EntityIdSchema, HexColorSchema, IsoDateTimeSchema, SlugSchema } from "./common.js";
import { VotePromptSchema } from "./votes.js";

export const MaturityRatingSchema = z.enum(["everyone", "teen", "mature"]);
export const EpisodeStatusSchema = z.enum(["draft", "queued", "generating", "ready", "published", "failed"]);

export const SeriesSchema = z.object({
  id: EntityIdSchema,
  slug: SlugSchema,
  title: z.string().min(2).max(100),
  tagline: z.string().min(4).max(140),
  logline: z.string().min(20).max(300),
  synopsis: z.string().min(80).max(1_500),
  genres: z.array(z.string().min(2).max(40)).min(1).max(5),
  maturityRating: MaturityRatingSchema,
  language: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/),
  poster: AssetSchema.optional(),
}).strict();

export const CharacterSchema = z.object({
  id: EntityIdSchema,
  name: z.string().min(2).max(80),
  role: z.string().min(2).max(80),
  age: z.int().min(13).max(100),
  pronouns: z.string().min(2).max(30),
  objective: z.string().min(10).max(300),
  flaw: z.string().min(10).max(300),
  secret: z.string().min(10).max(400),
  visualCues: z.array(z.string().min(3).max(160)).min(2).max(8),
}).strict();

export const EpisodeBlueprintSchema = z.object({
  id: EntityIdSchema,
  number: z.int().positive(),
  title: z.string().min(2).max(100),
  logline: z.string().min(20).max(300),
  storyBeats: z.array(z.string().min(10).max(400)).min(3).max(8),
  cliffhanger: z.string().min(15).max(400),
  generationPrompt: z.string().min(40).max(2_000),
  vote: VotePromptSchema,
}).strict();

export const SeriesBibleSchema = SeriesSchema.extend({
  schemaVersion: z.literal(1),
  format: z.object({
    aspectRatio: z.literal("9:16"),
    targetEpisodeSeconds: z.int().min(60).max(90),
    plannedEpisodes: z.int().min(20).max(100),
  }).strict(),
  world: z.object({
    setting: z.string().min(20).max(400),
    period: z.string().min(2).max(80),
    rules: z.array(z.string().min(10).max(300)).min(2).max(10),
  }).strict(),
  visualStyle: z.object({
    palette: z.array(HexColorSchema).min(3).max(8),
    camera: z.string().min(20).max(500),
    lighting: z.string().min(20).max(500),
    wardrobe: z.string().min(20).max(500),
  }).strict(),
  characters: z.array(CharacterSchema).min(3).max(12),
  seasonArc: z.object({
    premise: z.string().min(40).max(800),
    stakes: z.string().min(30).max(600),
    endingTargets: z.array(z.string().min(15).max(300)).min(2).max(6),
  }).strict(),
  episodes: z.array(EpisodeBlueprintSchema).min(3),
  tags: z.array(z.string().min(2).max(40)).min(2).max(12),
}).superRefine((series, context) => {
  const characterIds = new Set(series.characters.map(({ id }) => id));
  if (characterIds.size !== series.characters.length) {
    context.addIssue({ code: "custom", message: "Character IDs must be unique", path: ["characters"] });
  }
  const episodeIds = new Set(series.episodes.map(({ id }) => id));
  if (episodeIds.size !== series.episodes.length) {
    context.addIssue({ code: "custom", message: "Episode IDs must be unique", path: ["episodes"] });
  }
  series.episodes.forEach((episode, index) => {
    if (episode.number !== index + 1) {
      context.addIssue({ code: "custom", message: "Episode numbers must be sequential", path: ["episodes", index, "number"] });
    }
  });
  if (series.format.plannedEpisodes < series.episodes.length) {
    context.addIssue({ code: "custom", message: "plannedEpisodes cannot be less than outlined episodes", path: ["format", "plannedEpisodes"] });
  }
});

export const EpisodeSchema = z.object({
  id: EntityIdSchema,
  seriesId: EntityIdSchema,
  seasonNumber: z.int().positive(),
  episodeNumber: z.int().positive(),
  title: z.string().min(2).max(100),
  logline: z.string().min(20).max(300),
  status: EpisodeStatusSchema,
  durationSeconds: z.number().positive().optional(),
  video: AssetSchema.optional(),
  poster: AssetSchema.optional(),
  publishedAt: IsoDateTimeSchema.optional(),
}).strict();

export type Series = z.infer<typeof SeriesSchema>;
export type SeriesBible = z.infer<typeof SeriesBibleSchema>;
export type Character = z.infer<typeof CharacterSchema>;
export type EpisodeBlueprint = z.infer<typeof EpisodeBlueprintSchema>;
export type Episode = z.infer<typeof EpisodeSchema>;
export type EpisodeStatus = z.infer<typeof EpisodeStatusSchema>;
