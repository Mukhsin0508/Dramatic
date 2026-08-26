import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ProductionScriptSchema, SeriesBibleSchema } from "../src/index.js";

const seriesDirectory = fileURLToPath(new URL("../../../series", import.meta.url));
const scriptsDirectory = `${seriesDirectory}/scripts`;
const scriptFiles = readdirSync(scriptsDirectory).filter((file) => file.endsWith(".json"));
const bibleFiles = readdirSync(seriesDirectory).filter((file) => file.endsWith(".json"));
const bibles = bibleFiles.map((file) =>
  SeriesBibleSchema.parse(JSON.parse(readFileSync(`${seriesDirectory}/${file}`, "utf8"))),
);

describe("production scripts", () => {
  it("contains at least one discoverable production script", () => {
    expect(scriptFiles.length).toBeGreaterThanOrEqual(1);
  });

  it.each(scriptFiles)("validates and links %s to its series bible", (file) => {
    const document: unknown = JSON.parse(readFileSync(`${scriptsDirectory}/${file}`, "utf8"));
    const result = ProductionScriptSchema.safeParse(document);
    expect(result.error?.issues).toBeUndefined();
    expect(result.success).toBe(true);
    if (!result.success) return;

    const script = result.data;
    const bible = bibles.find(({ id }) => id === script.seriesId);
    expect(bible, `Missing series bible for ${script.seriesId}`).toBeDefined();
    const episode = bible?.episodes.find(({ id }) => id === script.episodeId);
    expect(episode, `Missing episode blueprint for ${script.episodeId}`).toBeDefined();
    expect(file).toBe(`${script.episodeId}.json`);
    expect(script.episodeNumber).toBe(episode?.number);
    expect(script.title).toBe(episode?.title);
    expect(script.logline).toBe(episode?.logline);
    expect(script.targetDurationSeconds).toBe(bible?.format.targetEpisodeSeconds);
    expect(script.endVote).toEqual(episode?.vote);

    const bibleCharacterIds = new Set(bible?.characters.map(({ id }) => id));
    for (const reference of script.continuity.characterReferences) {
      expect(bibleCharacterIds.has(reference.characterId)).toBe(true);
    }
  });

  it("rejects timeline gaps, dangling speakers, and subtitle drift", () => {
    const fixture = JSON.parse(readFileSync(`${scriptsDirectory}/${scriptFiles[0]}`, "utf8"));
    const withGap = structuredClone(fixture);
    withGap.shots[1].startSeconds += 1;
    expect(ProductionScriptSchema.safeParse(withGap).success).toBe(false);

    const withDanglingSpeaker = structuredClone(fixture);
    withDanglingSpeaker.shots[1].dialogue[0].speakerId = "missing-character";
    expect(ProductionScriptSchema.safeParse(withDanglingSpeaker).success).toBe(false);

    const withSubtitleDrift = structuredClone(fixture);
    withSubtitleDrift.subtitles[0].text = "This no longer matches the screenplay.";
    expect(ProductionScriptSchema.safeParse(withSubtitleDrift).success).toBe(false);
  });
});
