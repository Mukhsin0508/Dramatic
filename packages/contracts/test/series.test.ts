import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SeriesBibleSchema } from "../src/index.js";

const seriesDirectory = fileURLToPath(new URL("../../../series", import.meta.url));
const files = readdirSync(seriesDirectory).filter((file) => file.endsWith(".json"));

describe("series bibles", () => {
  it("contains at least three discoverable series", () => {
    expect(files.length).toBeGreaterThanOrEqual(3);
  });

  it.each(files)("validates %s", (file) => {
    const document: unknown = JSON.parse(readFileSync(`${seriesDirectory}/${file}`, "utf8"));
    const result = SeriesBibleSchema.safeParse(document);
    expect(result.error?.issues).toBeUndefined();
    expect(result.success).toBe(true);
    if (result.success) expect(file).toBe(`${result.data.slug}.json`);
  });

  it("uses unique IDs and slugs across the catalog", () => {
    const series = files.map((file) =>
      SeriesBibleSchema.parse(JSON.parse(readFileSync(`${seriesDirectory}/${file}`, "utf8"))),
    );
    expect(new Set(series.map(({ id }) => id)).size).toBe(series.length);
    expect(new Set(series.map(({ slug }) => slug)).size).toBe(series.length);
  });

  it("enforces the 60–90 second, 20+ episode product format", () => {
    const fixture = JSON.parse(readFileSync(`${seriesDirectory}/${files[0]}`, "utf8"));
    expect(SeriesBibleSchema.safeParse({ ...fixture, format: { ...fixture.format, targetEpisodeSeconds: 59 } }).success).toBe(false);
    expect(SeriesBibleSchema.safeParse({ ...fixture, format: { ...fixture.format, targetEpisodeSeconds: 91 } }).success).toBe(false);
    expect(SeriesBibleSchema.safeParse({ ...fixture, format: { ...fixture.format, plannedEpisodes: 19 } }).success).toBe(false);
  });

  it("rejects unknown bible fields instead of silently dropping typos", () => {
    const fixture = JSON.parse(readFileSync(`${seriesDirectory}/${files[0]}`, "utf8"));
    expect(SeriesBibleSchema.safeParse({ ...fixture, plannedEpisdoes: 24 }).success).toBe(false);
  });
});
