import { z } from "zod";
import { EntityIdSchema } from "./common.js";
import { VotePromptSchema } from "./votes.js";

const TimedRangeSchema = z.object({
  startSeconds: z.number().min(0).max(90),
  endSeconds: z.number().positive().max(90),
}).strict().refine(({ startSeconds, endSeconds }) => endSeconds > startSeconds, {
  message: "endSeconds must be after startSeconds",
  path: ["endSeconds"],
});

export const ScriptCharacterReferenceSchema = z.object({
  characterId: EntityIdSchema,
  soulReferenceId: EntityIdSchema,
  lockedAppearance: z.string().min(40).max(1_000),
  lockedWardrobe: z.string().min(20).max(600),
}).strict();

export const ScriptDialogueSchema = z.object({
  speakerId: EntityIdSchema,
  text: z.string().min(1).max(240),
  delivery: z.string().min(3).max(200),
}).strict();

export const ProductionShotSchema = z.object({
  id: EntityIdSchema,
  number: z.int().min(1).max(40),
  startSeconds: z.number().min(0).max(90),
  durationSeconds: z.number().positive().max(20),
  location: z.string().min(3).max(160),
  framing: z.enum(["extreme-close-up", "close-up", "medium", "wide", "insert", "over-shoulder"]),
  cameraDirection: z.string().min(20).max(600),
  action: z.string().min(20).max(1_000),
  dialogue: z.array(ScriptDialogueSchema).max(4),
  audio: z.array(z.string().min(3).max(240)).min(1).max(5),
  continuityCues: z.array(z.string().min(5).max(240)).min(1).max(8),
  soulKeyframePrompt: z.string().min(80).max(3_000),
  dopMotionPrompt: z.string().min(40).max(1_500),
}).strict();

export const SubtitleCueSchema = TimedRangeSchema.extend({
  id: EntityIdSchema,
  speakerId: EntityIdSchema.optional(),
  text: z.string().min(1).max(240),
  position: z.enum(["lower", "middle"]).default("lower"),
}).strict();

export const ProductionScriptSchema = z.object({
  schemaVersion: z.literal(1),
  id: EntityIdSchema,
  seriesId: EntityIdSchema,
  episodeId: EntityIdSchema,
  episodeNumber: z.int().positive(),
  title: z.string().min(2).max(100),
  language: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/),
  aspectRatio: z.literal("9:16"),
  targetDurationSeconds: z.number().min(60).max(90),
  logline: z.string().min(20).max(300),
  pilotMotionPrompt: z.string().min(80).max(8_000).optional(),
  continuity: z.object({
    location: z.string().min(20).max(500),
    timeAndWeather: z.string().min(10).max(300),
    immutableProps: z.array(z.string().min(5).max(240)).min(2).max(12),
    characterReferences: z.array(ScriptCharacterReferenceSchema).min(1).max(12),
  }).strict(),
  shots: z.array(ProductionShotSchema).length(10),
  subtitles: z.array(SubtitleCueSchema).min(1).max(80),
  endVote: VotePromptSchema,
}).strict().superRefine((script, context) => {
  const epsilon = 0.001;
  const characterIds = new Set(script.continuity.characterReferences.map(({ characterId }) => characterId));
  const soulIds = new Set(script.continuity.characterReferences.map(({ soulReferenceId }) => soulReferenceId));

  if (characterIds.size !== script.continuity.characterReferences.length) {
    context.addIssue({ code: "custom", message: "Character references must be unique", path: ["continuity", "characterReferences"] });
  }
  if (soulIds.size !== script.continuity.characterReferences.length) {
    context.addIssue({ code: "custom", message: "Soul reference IDs must be unique", path: ["continuity", "characterReferences"] });
  }

  script.shots.forEach((shot, index) => {
    if (shot.number !== index + 1) {
      context.addIssue({ code: "custom", message: "Shot numbers must be sequential", path: ["shots", index, "number"] });
    }
    const expectedStart = index === 0
      ? 0
      : script.shots[index - 1]!.startSeconds + script.shots[index - 1]!.durationSeconds;
    if (Math.abs(shot.startSeconds - expectedStart) > epsilon) {
      context.addIssue({ code: "custom", message: "Shots must form a contiguous timeline", path: ["shots", index, "startSeconds"] });
    }
    for (const [dialogueIndex, dialogue] of shot.dialogue.entries()) {
      if (!characterIds.has(dialogue.speakerId)) {
        context.addIssue({ code: "custom", message: "Dialogue speaker needs a character reference", path: ["shots", index, "dialogue", dialogueIndex, "speakerId"] });
      }
    }
  });

  const finalShot = script.shots.at(-1);
  if (finalShot && Math.abs(finalShot.startSeconds + finalShot.durationSeconds - script.targetDurationSeconds) > epsilon) {
    context.addIssue({ code: "custom", message: "Shot timeline must equal targetDurationSeconds", path: ["targetDurationSeconds"] });
  }

  const subtitleIds = new Set<string>();
  script.subtitles.forEach((subtitle, index) => {
    if (subtitleIds.has(subtitle.id)) {
      context.addIssue({ code: "custom", message: "Subtitle IDs must be unique", path: ["subtitles", index, "id"] });
    }
    subtitleIds.add(subtitle.id);
    if (subtitle.endSeconds > script.targetDurationSeconds) {
      context.addIssue({ code: "custom", message: "Subtitle exceeds episode duration", path: ["subtitles", index, "endSeconds"] });
    }
    if (subtitle.speakerId && !characterIds.has(subtitle.speakerId)) {
      context.addIssue({ code: "custom", message: "Subtitle speaker needs a character reference", path: ["subtitles", index, "speakerId"] });
    }
  });

  const dialogueEntries = script.shots.flatMap((shot) =>
    shot.dialogue.map(({ text }) => ({
      text,
      shotStart: shot.startSeconds,
      shotEnd: shot.startSeconds + shot.durationSeconds,
    })),
  );
  const subtitleLines = script.subtitles.map(({ text }) => text);
  if (dialogueEntries.length !== subtitleLines.length || dialogueEntries.some(({ text }, index) => text !== subtitleLines[index])) {
    context.addIssue({ code: "custom", message: "Subtitle text must match dialogue in screenplay order", path: ["subtitles"] });
  }
  dialogueEntries.forEach(({ shotStart, shotEnd }, index) => {
    const subtitle = script.subtitles[index];
    if (subtitle && (subtitle.startSeconds < shotStart || subtitle.endSeconds > shotEnd)) {
      context.addIssue({ code: "custom", message: "Subtitle timing must stay inside its dialogue shot", path: ["subtitles", index] });
    }
  });
});

export type ScriptCharacterReference = z.infer<typeof ScriptCharacterReferenceSchema>;
export type ScriptDialogue = z.infer<typeof ScriptDialogueSchema>;
export type ProductionShot = z.infer<typeof ProductionShotSchema>;
export type SubtitleCue = z.infer<typeof SubtitleCueSchema>;
export type ProductionScript = z.infer<typeof ProductionScriptSchema>;
