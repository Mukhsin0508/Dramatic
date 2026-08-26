import { describe, expect, it } from "vitest";
import { EpisodeBlueprintSchema, GenerationJobSchema, VotePromptSchema, VoteTallySchema } from "../src/index.js";

describe("GenerationJobSchema", () => {
  const baseJob = {
    id: "job-001",
    seriesId: "the-last-alibi",
    progress: 1,
    createdAt: "2026-08-26T10:00:00+00:00",
    updatedAt: "2026-08-26T10:01:00+00:00",
  };

  it("accepts a provider-neutral successful job", () => {
    expect(
      GenerationJobSchema.safeParse({
        ...baseJob,
        status: "succeeded",
        provider: "mock",
        output: {
          video: { url: "https://cdn.example.com/episode.mp4", width: 1080, height: 1920 },
          durationSeconds: 72,
          mimeType: "video/mp4",
        },
      }).success,
    ).toBe(true);
  });

  it("rejects a successful job without output", () => {
    expect(GenerationJobSchema.safeParse({ ...baseJob, status: "succeeded" }).success).toBe(false);
  });
});

describe("VoteTallySchema", () => {
  it("rejects inconsistent totals", () => {
    expect(
      VoteTallySchema.safeParse({
        voteId: "vote-001",
        totalVotes: 5,
        options: [
          { optionId: "open-door", votes: 2 },
          { optionId: "walk-away", votes: 2 },
        ],
        computedAt: "2026-08-26T10:00:00+00:00",
      }).success,
    ).toBe(false);
  });
});

describe("vertical-drama content invariants", () => {
  it("limits cliffhangers to two or three audience choices", () => {
    const option = (id: string) => ({ id, label: `Choice ${id}`, consequence: "This choice changes the next scene.", generationDirective: "Continue from this choice in the next generated episode." });
    expect(VotePromptSchema.safeParse({ id: "vote-one", question: "What happens next?", options: [option("a"), option("b"), option("c"), option("d")] }).success).toBe(false);
  });

  it("requires every outlined episode to end in a vote", () => {
    expect(EpisodeBlueprintSchema.safeParse({
      id: "episode-one",
      number: 1,
      title: "A Missing Vote",
      logline: "A strong cliffhanger lands, but the audience is never asked what should happen next.",
      storyBeats: ["The lead finds a hidden message in the hall.", "The rival arrives before it can be opened.", "A second phone begins ringing behind the wall."],
      cliffhanger: "The wall opens and reveals someone the lead believed was dead.",
      generationPrompt: "Build a tense vertical episode around the hidden phone and finish on the impossible reveal.",
    }).success).toBe(false);
  });
});
