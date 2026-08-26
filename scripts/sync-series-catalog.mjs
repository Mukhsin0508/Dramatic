import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const seriesDirectory = join(repositoryRoot, "series");
const presentationPath = join(seriesDirectory, "presentation", "catalog.json");
const argumentsSet = new Set(process.argv.slice(2));
const checkOnly = argumentsSet.has("--check");
const requestedTarget = readTarget(process.argv.slice(2));

const bibles = readdirSync(seriesDirectory)
  .filter((file) => extname(file) === ".json")
  .map((file) => JSON.parse(readFileSync(join(seriesDirectory, file), "utf8")));
const presentation = JSON.parse(readFileSync(presentationPath, "utf8"));
const presentationBySlug = presentation.series ?? {};

for (const slug of Object.keys(presentationBySlug)) {
  if (!bibles.some((bible) => bible.slug === slug)) {
    throw new Error(`Presentation metadata references missing series bible: ${slug}`);
  }
}

const catalog = bibles
  .map((bible) => toCatalogEntry(bible, presentationBySlug[bible.slug]))
  .sort((left, right) => left.featuredRank - right.featuredRank || left.title.localeCompare(right.title));

const targets = requestedTarget === "all" ? ["mobile", "web"] : [requestedTarget];
for (const target of targets) {
  if (target === "mobile") syncFile(
    join(repositoryRoot, "apps", "mobile", "src", "data", "stories.generated.ts"),
    renderMobile(catalog),
  );
  if (target === "web") syncFile(
    join(repositoryRoot, "apps", "web", "src", "data", "stories.generated.ts"),
    renderWeb(catalog),
  );
}

function readTarget(args) {
  const index = args.indexOf("--target");
  if (index === -1) return "all";
  const target = args[index + 1];
  if (target !== "mobile" && target !== "web") {
    throw new Error("--target must be mobile or web");
  }
  return target;
}

function toCatalogEntry(bible, overrides = {}) {
  const latest = bible.episodes.at(-1);
  if (!latest) throw new Error(`${bible.slug} must outline at least one episode`);
  if (bible.id !== bible.slug) throw new Error(`${bible.slug} must keep id and slug identical`);

  const playableEpisode = bible.episodes.find((episode) => findMobileVideo(bible.slug, episode.number))
    ?? bible.episodes[0];
  const mobileVideo = findMobileVideo(bible.slug, playableEpisode.number);

  const mobilePoster = findMobilePoster(bible.slug);
  const webPoster = findWebPoster(bible.slug);

  const vote = overrides.vote ?? (latest.vote
    ? { question: latest.vote.question, choices: latest.vote.options.map((option) => option.label) }
    : undefined);
  if (vote && (vote.choices.length < 2 || vote.choices.length > 3)) {
    throw new Error(`${bible.slug} presentation vote needs two or three choices`);
  }

  return {
    id: bible.id,
    title: bible.title,
    description: bible.synopsis,
    genres: bible.genres.slice(0, 2).map(titleCase).join(" · "),
    episodeCount: bible.format.plannedEpisodes,
    episode: overrides.currentEpisode ?? latest.number,
    episodeTitle: overrides.episodeTitle ?? latest.title,
    synopsis: overrides.episodeLogline ?? latest.logline,
    hook: overrides.hook ?? latest.cliffhanger,
    activeVoters: overrides.activeVoters ?? 0,
    likes: overrides.likes ?? "New",
    comments: overrides.comments ?? "0",
    progress: overrides.progress ?? 0,
    locked: overrides.locked ?? false,
    mediaKind: ["cold-open", "teaser"].includes(overrides.mediaKind) ? overrides.mediaKind : "episode",
    runtimeLabel: typeof overrides.runtimeLabel === "string" ? overrides.runtimeLabel : "60–90 sec",
    captionsAvailable: overrides.captionsAvailable === true,
    videoFit: overrides.videoFit === "contain" ? "contain" : "cover",
    vote,
    featuredRank: overrides.featuredRank ?? Number.MAX_SAFE_INTEGER,
    mobilePoster,
    webPoster,
    mobile: {
      episodeId: playableEpisode.id,
      episode: playableEpisode.number,
      episodeTitle: playableEpisode.title,
      synopsis: playableEpisode.logline,
      vote: playableEpisode.vote
        ? {
            question: playableEpisode.vote.question,
            choices: playableEpisode.vote.options.map((option) => option.label),
          }
        : undefined,
      videoSource: mobileVideo?.source,
      videoAspect: mobileVideo?.aspect,
    },
  };
}

function findMobilePoster(slug) {
  const directory = join(repositoryRoot, "apps", "mobile", "assets", "images", "stories");
  const generated = findReceiptPoster(slug, "path", directory);
  if (generated) return `../../assets/images/stories/${generated}`;
  for (const extension of ["jpg", "jpeg", "webp", "png"]) {
    const candidate = join(directory, `${slug}.${extension}`);
    if (existsSync(candidate)) return `../../assets/images/stories/${slug}.${extension}`;
  }
  throw new Error(`Missing mobile artwork for ${slug} under ${directory}`);
}

function findWebPoster(slug) {
  const directory = join(repositoryRoot, "apps", "web", "public", "media");
  const generated = findReceiptPoster(slug, "webPath", directory);
  if (generated) return `/media/${generated}`;
  for (const extension of ["png", "jpg", "jpeg", "webp"]) {
    const candidate = join(directory, `${slug}.${extension}`);
    if (existsSync(candidate)) return `/media/${slug}.${extension}`;
  }
  throw new Error(`Missing landing artwork for ${slug} under ${directory}`);
}

function findReceiptPoster(slug, field, expectedDirectory) {
  const directory = join(seriesDirectory, "production", "receipts");
  if (!existsSync(directory)) return undefined;
  const receipts = readdirSync(directory)
    .filter((file) => file.startsWith(`${slug}-`) && file.endsWith(".json"))
    .map((file) => JSON.parse(readFileSync(join(directory, file), "utf8")))
    .filter((receipt) => receipt.seriesId === slug && Number.isSafeInteger(receipt.episodeNumber))
    .sort((left, right) => right.episodeNumber - left.episodeNumber);
  for (const receipt of receipts) {
    if (!Array.isArray(receipt.artifacts)) continue;
    const poster = receipt.artifacts.find((artifact) => artifact?.kind === "poster");
    const relativePath = poster?.[field];
    if (typeof relativePath !== "string") continue;
    const absolutePath = resolve(repositoryRoot, relativePath);
    const extension = extname(absolutePath).slice(1).toLowerCase();
    const expectedFilename = `${slug}.${extension}`;
    if (
      !["jpg", "jpeg", "png", "webp"].includes(extension)
      || dirname(absolutePath) !== expectedDirectory
      || absolutePath !== join(expectedDirectory, expectedFilename)
      || !existsSync(absolutePath)
    ) continue;
    return expectedFilename;
  }
  return undefined;
}

function findMobileVideo(slug, episodeNumber) {
  const filename = `${slug}-${String(episodeNumber).padStart(2, "0")}.mp4`;
  const path = join(repositoryRoot, "apps", "mobile", "assets", "videos", filename);
  if (!existsSync(path)) return undefined;
  assertMp4Asset(path);
  const dimensions = readMp4Dimensions(path);
  return {
    source: `../../assets/videos/${filename}`,
    aspect: dimensions ? Number((dimensions.width / dimensions.height).toFixed(4)) : undefined,
  };
}

function readMp4Dimensions(path) {
  const buffer = readFileSync(path);
  const tracks = [];
  walkMp4Boxes(buffer, 0, buffer.length, tracks);
  return tracks.find((track) => track.width > 0 && track.height > 0);
}

function walkMp4Boxes(buffer, start, end, tracks) {
  let offset = start;
  while (offset + 8 <= end) {
    let size = buffer.readUInt32BE(offset);
    const type = buffer.toString("latin1", offset + 4, offset + 8);
    let headerSize = 8;
    if (size === 1) {
      size = Number(buffer.readBigUInt64BE(offset + 8));
      headerSize = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < headerSize || offset + size > end) return;
    const contentStart = offset + headerSize;
    if (type === "moov" || type === "trak") {
      walkMp4Boxes(buffer, contentStart, offset + size, tracks);
    } else if (type === "tkhd") {
      const version = buffer[contentStart];
      const dimensionOffset = contentStart + (version === 1 ? 88 : 76);
      if (dimensionOffset + 8 <= offset + size) {
        tracks.push({
          width: buffer.readUInt32BE(dimensionOffset) / 65536,
          height: buffer.readUInt32BE(dimensionOffset + 4) / 65536,
        });
      }
    }
    offset += size;
  }
}

function assertMp4Asset(path) {
  if (statSync(path).size < 32) {
    throw new Error(`Video asset is empty or truncated: ${path}`);
  }
  const header = Buffer.alloc(32);
  const descriptor = openSync(path, "r");
  try {
    readSync(descriptor, header, 0, header.length, 0);
  } finally {
    closeSync(descriptor);
  }
  if (!header.includes(Buffer.from("ftyp"))) {
    throw new Error(`Video asset is not an MP4 file: ${path}`);
  }
}

function titleCase(value) {
  return value.replace(/\b\p{L}/gu, (character) => character.toUpperCase());
}

function renderMobile(entries) {
  const rows = entries.map((entry) => {
    const fields = {
      id: entry.id,
      title: entry.title,
      episodeId: entry.mobile.episodeId,
      episode: entry.mobile.episode,
      episodeCount: entry.episodeCount,
      episodeTitle: entry.mobile.episodeTitle,
      synopsis: entry.mobile.synopsis,
      description: entry.description,
      genres: entry.genres.toUpperCase(),
      mediaKind: entry.mediaKind,
      runtimeLabel: entry.runtimeLabel,
      captionsAvailable: entry.captionsAvailable,
      videoFit: entry.videoFit,
      ...(entry.mobile.videoAspect ? { videoAspect: entry.mobile.videoAspect } : {}),
      ...(entry.mobile.vote ? { vote: entry.mobile.vote } : {}),
    };
    const lines = JSON.stringify(fields, null, 2).split("\n");
    lines[lines.length - 2] += ",";
    lines.splice(
      -1,
      1,
      `  poster: require(${JSON.stringify(entry.mobilePoster)}),`,
      ...(entry.mobile.videoSource
        ? [`  videoSource: require(${JSON.stringify(entry.mobile.videoSource)}),`]
        : []),
      "}",
    );
    return lines.map((line) => `  ${line}`).join("\n");
  });

  return `// Generated by scripts/sync-series-catalog.mjs. Do not edit by hand.\nimport type { ImageSource } from "expo-image";\nimport type { VideoSource } from "expo-video";\n\nexport type Story = {\n  id: string;\n  title: string;\n  episodeId: string;\n  episode: number;\n  episodeCount: number;\n  episodeTitle: string;\n  synopsis: string;\n  description: string;\n  genres: string;\n  poster: ImageSource | string | number;\n  videoSource?: VideoSource;\n  mediaKind: "episode" | "cold-open" | "teaser";\n  runtimeLabel: string;\n  captionsAvailable: boolean;\n  videoFit: "cover" | "contain";\n  videoAspect?: number;\n  locked?: boolean;\n  vote?: { question: string; choices: readonly string[] };\n};\n\nexport const STORIES: Story[] = [\n${rows.join(",\n")}\n];\n`;
}

function renderWeb(entries) {
  const rows = entries.map((entry) => ({
    id: entry.id,
    title: entry.title,
    image: entry.webPoster,
    episode: `Episode ${entry.episode}`,
    hook: entry.hook,
    votes: entry.activeVoters > 0 ? `${compactNumber(entry.activeVoters)} voting` : "Vote open",
    tone: entry.genres,
    mediaLabel: entry.mediaKind === "cold-open"
      ? "Cold open"
      : entry.mediaKind === "teaser"
        ? "Video teaser"
        : entry.mobile.videoSource
          ? "Episode"
          : "Story preview",
    runtimeLabel: entry.mediaKind === "episode" && !entry.mobile.videoSource
      ? `${entry.runtimeLabel} target`
      : entry.runtimeLabel,
  }));
  return `// Generated by scripts/sync-series-catalog.mjs. Do not edit by hand.\nexport const LANDING_STORIES = ${JSON.stringify(rows, null, 2)} as const;\n`;
}

function compactNumber(value) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function syncFile(path, content) {
  if (checkOnly) {
    const current = existsSync(path) ? readFileSync(path, "utf8") : "";
    if (current !== content) {
      throw new Error(`${path} is stale. Run pnpm sync:content.`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}
