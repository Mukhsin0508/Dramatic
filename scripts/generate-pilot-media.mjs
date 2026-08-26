#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  access,
  copyFile,
  mkdir,
  open,
  readFile,
  rename,
  stat,
  unlink,
} from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let slug;
let episodeNumber;
let episodeToken;
let posterOnly;
let reusePoster;
let clipTier;
let maxUsd;
let credential;
let apiBaseUrl;
let posterPrompt;
let motionPrompt;
let checkpointPath;
let publicReceiptPath;
let acceptedHandles;
let estimates;
let artifacts;
let submissionIntents;
let client;

async function main() {
  const argumentsMap = parseArguments(process.argv.slice(2));
  validateArguments(argumentsMap);
  slug = requireSlug(argumentsMap.get("slug"));
  episodeNumber = requireEpisode(argumentsMap.get("episode") ?? "1");
  episodeToken = String(episodeNumber).padStart(2, "0");
  posterOnly = argumentsMap.has("poster-only");
  reusePoster = argumentsMap.has("reuse-poster");
  clipTier = readClipTier(argumentsMap.get("clip-tier"));
  maxUsd = readPositiveNumber(process.env.HIGGSFIELD_MAX_USD ?? "5", "HIGGSFIELD_MAX_USD");
  credential = readCredential(process.env);
  apiBaseUrl = readApiBaseUrl(process.env.HIGGSFIELD_API_BASE_URL);

  const scriptPath = join(repositoryRoot, "series", "scripts", `${slug}-${episodeToken}.json`);
  const productionScript = JSON.parse(await readFile(scriptPath, "utf8"));
  assertScriptIdentity(productionScript, slug, episodeNumber);
  posterPrompt = readPosterPrompt(productionScript);
  motionPrompt = posterOnly ? undefined : readMotionPrompt(productionScript);
  const privateDirectory = join(repositoryRoot, ".dramatic", "generation");
  checkpointPath = join(privateDirectory, `${slug}-${episodeToken}.json`);
  publicReceiptPath = join(
    repositoryRoot,
    "series",
    "production",
    "receipts",
    `${slug}-${episodeToken}.json`,
  );

  const lock = await acquireEpisodeLock(`${checkpointPath}.lock`);
  try {
    const checkpoint = await readCheckpoint(checkpointPath, slug, episodeNumber);
    acceptedHandles = checkpoint.operations ?? {};
    estimates = checkpoint.estimates ?? {};
    artifacts = checkpoint.artifacts ?? {};
    submissionIntents = checkpoint.submissionIntents ?? {};
    await applyRecoveryArguments(argumentsMap);

    const { createSdkBackedHiggsfieldClient } = await import("../packages/higgsfield/dist/index.js");
    client = createSdkBackedHiggsfieldClient({
      endpoints: {
        poster: "higgsfield-ai/soul/v2/standard",
        clip: "higgsfield-ai/dop/lite",
        "clip-turbo": "higgsfield-ai/dop/turbo",
        "clip-standard": "higgsfield-ai/dop/standard",
      },
      config: {
        baseUrl: apiBaseUrl,
        requestTimeoutMs: 120_000,
        userAgent: "dramatic-pilot/0.1",
      },
    });

    const poster = reusePoster
      ? await existingPoster(slug)
      : await generatePoster();

    if (!posterOnly) {
      await generateClip(poster);
    }

    await savePublicReceipt();

    console.log(`Higgsfield media ready for ${slug}, episode ${episodeNumber}.`);
    console.log(`Receipt: ${relative(publicReceiptPath)}`);
  } finally {
    await releaseEpisodeLock(lock, `${checkpointPath}.lock`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : "Pilot generation failed.";
    console.error(`Error: ${message}`);
    process.exitCode = 1;
  });
}

async function generatePoster() {
  const operation = "poster";
  const endpoint = "higgsfield-ai/soul/v2/standard";
  const input = buildPosterInput(posterPrompt);
  const handle = await submitOnce(operation, endpoint, input, "Poster");

  const terminal = await waitFor(handle, "poster");
  assertCompleted(terminal, "poster");
  const artifact = terminal.artifacts.find((item) => item.kind === "image");
  if (!artifact) throw new Error("Completed poster request returned no image.");
  const recordedPath = artifacts.poster?.requestId === handle.id
    ? resolve(repositoryRoot, artifacts.poster.path)
    : undefined;
  const proposedExtension = recordedPath ? extname(recordedPath) : imageExtension(artifact);
  let mobilePath = join(
    repositoryRoot,
    "apps",
    "mobile",
    "assets",
    "images",
    "stories",
    `${slug}${proposedExtension}`,
  );
  const receipt = await downloadIfNeeded(artifact, mobilePath, "image");
  const verifiedExtension = imageExtensionFromContentType(receipt.contentType) ?? proposedExtension;
  if (verifiedExtension !== proposedExtension) {
    const correctedPath = join(dirname(mobilePath), `${slug}${verifiedExtension}`);
    await rename(mobilePath, correctedPath);
    mobilePath = correctedPath;
  }
  const webPath = join(repositoryRoot, "apps", "web", "public", "media", `${slug}${verifiedExtension}`);
  await mkdir(dirname(webPath), { recursive: true });
  await copyFile(mobilePath, webPath);
  artifacts.poster = {
    kind: "poster",
    requestId: handle.id,
    endpoint,
    path: relative(mobilePath),
    webPath: relative(webPath),
    bytes: receipt.bytesWritten,
    sha256: receipt.sha256,
    contentType: receipt.contentType ?? artifact.contentType ?? "application/octet-stream",
    remoteUrl: artifact.url,
  };
  await saveCheckpoint();
  await savePublicReceipt();
  return { path: mobilePath, contentType: artifacts.poster.contentType };
}

async function generateClip(posterAsset) {
  const operation = clipOperationForTier(clipTier);
  const endpoint = clipEndpointForTier(clipTier);
  const label = `Pilot ${clipTier} clip`;
  let handle = acceptedHandles[operation];
  if (!handle) {
    assertNoUnresolvedIntent(operation);
    const publicUrl = await uploadImage(posterAsset.path, posterAsset.contentType);
    // Every allowed DoP tier uses the documented prompt and image_url contract.
    const input = buildClipInput(motionPrompt, publicUrl);
    handle = await submitOnce(operation, endpoint, input, label);
  } else {
    console.log(`Resuming ${label.toLowerCase()} request ${handle.id}.`);
  }

  const terminal = await waitFor(handle, label.toLowerCase());
  assertCompleted(terminal, label.toLowerCase());
  const artifact = terminal.artifacts.find((item) => item.kind === "video");
  if (!artifact) throw new Error("Completed pilot clip request returned no video.");
  const outputPath = join(
    repositoryRoot,
    "apps",
    "mobile",
    "assets",
    "videos",
    `${slug}-${episodeToken}.mp4`,
  );
  const receipt = await downloadIfNeeded(artifact, outputPath, "video");
  const webPath = join(
    repositoryRoot,
    "apps",
    "web",
    "public",
    "media",
    `${slug}-${episodeToken}.mp4`,
  );
  await mkdir(dirname(webPath), { recursive: true });
  await copyFile(outputPath, webPath);
  artifacts.clip = {
    kind: "video",
    requestId: handle.id,
    endpoint,
    path: relative(outputPath),
    webPath: relative(webPath),
    bytes: receipt.bytesWritten,
    sha256: receipt.sha256,
    contentType: receipt.contentType ?? artifact.contentType ?? "video/mp4",
    remoteUrl: artifact.url,
  };
  await saveCheckpoint();
  await savePublicReceipt();
}

async function submitOnce(operation, endpoint, input, label) {
  const disposition = operationDisposition(acceptedHandles, submissionIntents, operation);
  if (disposition.state === "resume") {
    console.log(`Resuming ${label.toLowerCase()} request ${disposition.handle.id}.`);
    return disposition.handle;
  }
  assertNoUnresolvedIntent(operation);

  const inputSha256 = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const savedEstimate = estimates[operation];
  if (savedEstimate?.endpoint !== endpoint || savedEstimate?.inputSha256 !== inputSha256) {
    estimates[operation] = {
      ...await estimate(endpoint, input),
      endpoint,
      inputSha256,
    };
    await saveCheckpoint();
  }
  enforceBudget();

  submissionIntents[operation] = {
    state: "dispatching",
    endpoint,
    inputSha256,
    startedAt: new Date().toISOString(),
  };
  await saveCheckpoint();

  try {
    const handle = await client.submit(operation, input);
    acceptedHandles[operation] = handle;
    delete submissionIntents[operation];
    await saveCheckpoint();
    console.log(`${label} accepted as request ${handle.id}.`);
    return handle;
  } catch (error) {
    if (error?.code === "ambiguous_submission") {
      submissionIntents[operation] = {
        ...submissionIntents[operation],
        state: "ambiguous",
        blockedAt: new Date().toISOString(),
      };
      await saveCheckpoint();
      throw new Error(
        `${label} submission may have been accepted. Automatic retry is blocked; recover the provider request or explicitly confirm it was not submitted.`,
      );
    }
    delete submissionIntents[operation];
    await saveCheckpoint();
    throw error;
  }
}

function assertNoUnresolvedIntent(operation) {
  if (!hasUnresolvedIntent(submissionIntents, operation)) return;
  throw new Error(
    `The ${operation} submission has an unresolved dispatch checkpoint. Automatic resubmission is blocked to prevent duplicate charges.`,
  );
}

function hasUnresolvedIntent(intents, operation) {
  return Boolean(intents[operation]);
}

function operationDisposition(operations, intents, operation) {
  const handle = operations[operation];
  if (handle) return { state: "resume", handle };
  if (hasUnresolvedIntent(intents, operation)) return { state: "blocked" };
  return { state: "submit" };
}

async function estimate(endpoint, input) {
  const response = await fetch(new URL(`/estimate/${endpoint}`, apiBaseUrl), {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Key ${credential}`,
      "Content-Type": "application/json",
      "User-Agent": "dramatic-pilot/0.1",
    },
    body: JSON.stringify(input),
  });
  const body = await response.json().catch(() => undefined);
  if (response.status === 401) throw new Error("Higgsfield authentication failed; no generation was submitted.");
  if (response.status === 403) throw new Error("Higgsfield has insufficient credits; no generation was submitted.");
  if (!response.ok) throw new Error(`Higgsfield estimate failed with HTTP ${response.status}; no generation was submitted.`);
  if (!isRecord(body) || !isDecimal(body.credits) || !isDecimal(body.usd)) {
    throw new Error("Higgsfield estimate response omitted valid credits or USD.");
  }
  console.log(`Estimate for ${endpoint}: ${body.credits} credits / $${body.usd}.`);
  return { credits: body.credits, usd: body.usd, observedAt: new Date().toISOString() };
}

async function uploadImage(path, contentType) {
  const normalizedContentType = normalizeImageContentType(contentType, path);
  const file = await stat(path);
  if (file.size > 25 * 1024 * 1024) throw new Error("Poster exceeds the 25 MB upload limit.");
  const response = await fetch(new URL("/files/generate-upload-url", apiBaseUrl), {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Key ${credential}`,
      "Content-Type": "application/json",
      "User-Agent": "dramatic-pilot/0.1",
    },
    body: JSON.stringify({ content_type: normalizedContentType }),
  });
  const body = await response.json().catch(() => undefined);
  if (response.status === 401) throw new Error("Higgsfield authentication failed before clip submission.");
  if (response.status === 403) throw new Error("Higgsfield has insufficient credits; the clip was not submitted.");
  if (!response.ok || !isUploadEnvelope(body)) {
    throw new Error(`Higgsfield upload initialization failed with HTTP ${response.status}.`);
  }
  if (body.content_type !== normalizedContentType) {
    throw new Error("Higgsfield upload initialization returned a mismatched content type.");
  }
  const uploadUrl = new URL(body.upload_url);
  const publicUrl = new URL(body.public_url);
  if (
    uploadUrl.protocol !== "https:"
    || publicUrl.protocol !== "https:"
    || uploadUrl.username
    || uploadUrl.password
    || publicUrl.username
    || publicUrl.password
  ) {
    throw new Error("Higgsfield returned an unsafe upload URL.");
  }
  const uploadHeaders = Object.fromEntries(
    Object.entries(body.upload_headers).filter(
      ([name, value]) => typeof value === "string"
        && !/[\r\n]/u.test(name)
        && !/[\r\n]/u.test(value)
        && !["authorization", "cookie", "proxy-authorization"].includes(name.toLowerCase()),
    ),
  );
  const uploadContentType = Object.entries(uploadHeaders).find(
    ([name]) => name.toLowerCase() === "content-type",
  )?.[1];
  if (uploadContentType !== normalizedContentType) {
    throw new Error("Higgsfield upload headers omitted the exact requested content type.");
  }
  const upload = await fetch(uploadUrl, {
    method: "PUT",
    headers: uploadHeaders,
    body: await readFile(path),
    redirect: "error",
  });
  if (!upload.ok) throw new Error(`Higgsfield asset upload failed with HTTP ${upload.status}.`);
  return publicUrl.href;
}

async function waitFor(handle, label) {
  let previousStatus;
  return client.wait(handle, {
    timeoutMs: 12 * 60 * 1_000,
    initialDelayMs: 2_000,
    maxDelayMs: 10_000,
    onStatus(snapshot) {
      if (snapshot.status !== previousStatus) {
        previousStatus = snapshot.status;
        console.log(`${label}: ${snapshot.status}.`);
      }
    },
  });
}

async function downloadIfNeeded(artifact, outputPath, expectedKind) {
  const recorded = Object.values(artifacts).find((item) => item?.path === relative(outputPath));
  if (recorded && await existingArtifactMatches(outputPath, recorded)) {
    const contentType = verifiedMediaContentType(expectedKind, recorded.contentType, artifact.url);
    return {
      location: outputPath,
      bytesWritten: recorded.bytes,
      sha256: recorded.sha256,
      contentType,
    };
  }
  await mkdir(dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.part`;
  await unlink(temporaryPath).catch(() => undefined);
  let verifiedContentType;
  const receipt = await client.download(
    artifact,
    {
      async consume(chunks, metadata) {
        verifiedContentType = verifiedMediaContentType(
          expectedKind,
          metadata.contentType ?? artifact.contentType,
          artifact.url,
        );
        const file = await open(temporaryPath, "wx", 0o600);
        try {
          for await (const chunk of chunks) await file.write(chunk);
        } finally {
          await file.close();
        }
        await rename(temporaryPath, outputPath);
        return { location: outputPath };
      },
    },
    { maxBytes: artifact.kind === "video" ? 250 * 1024 * 1024 : 25 * 1024 * 1024 },
  );
  return { ...receipt, contentType: verifiedContentType };
}

async function existingArtifactMatches(path, recorded) {
  if (!await exists(path)) return false;
  const file = await stat(path);
  if (file.size !== recorded.bytes || typeof recorded.sha256 !== "string") return false;
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex") === recorded.sha256;
}

async function existingPoster(seriesSlug) {
  const directory = join(repositoryRoot, "apps", "mobile", "assets", "images", "stories");
  for (const extension of [".jpg", ".jpeg", ".png", ".webp"]) {
    const path = join(directory, `${seriesSlug}${extension}`);
    if (await exists(path)) return { path, contentType: normalizeImageContentType(undefined, path) };
  }
  throw new Error(`No reusable poster exists for ${seriesSlug}.`);
}

function readPosterPrompt(value) {
  const prompt = value.keyArtPrompt
    ?? value.posterPrompt
    ?? value.shots?.[0]?.soulKeyframePrompt
    ?? value.shots?.[0]?.soulPrompt
    ?? value.shots?.[0]?.keyframePrompt;
  if (typeof prompt !== "string" || prompt.length < 40) {
    throw new Error("Production script needs keyArtPrompt, posterPrompt, or a first-shot Soul prompt.");
  }
  return prompt;
}

function buildPosterInput(prompt) {
  return {
    prompt,
    resolution: "720p",
    aspect_ratio: "9:16",
    batch_size: 1,
    enhance_prompt: true,
  };
}

function buildClipInput(prompt, imageUrl) {
  return { prompt, image_url: imageUrl };
}

function readMotionPrompt(value) {
  const prompt = value.pilotMotionPrompt
    ?? value.shots?.[0]?.dopMotionPrompt
    ?? value.shots?.[0]?.dopPrompt
    ?? value.shots?.[0]?.motionPrompt;
  if (typeof prompt !== "string" || prompt.length < 20) {
    throw new Error("Production script needs pilotMotionPrompt or a first-shot DoP prompt.");
  }
  return prompt;
}

function assertCompleted(terminal, label) {
  if (terminal.status !== "completed") {
    const detail = terminal.status === "failed" ? `: ${terminal.failure.message ?? "provider failure"}` : "";
    throw new Error(`${label} ended as ${terminal.status}${detail}.`);
  }
}

function enforceBudget() {
  const total = estimatedUsdTotal(estimates);
  if (total > maxUsd) {
    throw new Error(`Estimated generation cost $${total.toFixed(3)} exceeds HIGGSFIELD_MAX_USD=$${maxUsd.toFixed(2)}; no new request was submitted.`);
  }
}

async function saveCheckpoint() {
  await writeJsonAtomic(checkpointPath, {
    schemaVersion: 1,
    seriesId: slug,
    episodeNumber,
    operations: acceptedHandles,
    estimates,
    artifacts,
    submissionIntents,
  }, 0o600);
}

async function savePublicReceipt() {
  await writeJsonAtomic(publicReceiptPath, {
    schemaVersion: 1,
    provider: "higgsfield",
    sdk: "@higgsfield/client@0.2.1",
    seriesId: slug,
    episodeNumber,
    sourceScript: `series/scripts/${slug}-${episodeToken}.json`,
    generatedAt: new Date().toISOString(),
    estimates: sanitizePublicEstimates(estimates),
    artifacts: Object.values(artifacts).map(sanitizePublicArtifact),
  });
}

async function readCheckpoint(path, seriesId, number) {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    if (parsed.schemaVersion !== 1 || parsed.seriesId !== seriesId || parsed.episodeNumber !== number) {
      throw new Error("Generation checkpoint does not match the requested episode.");
    }
    return parsed;
  } catch (error) {
    if (error?.code === "ENOENT") return { schemaVersion: 1, seriesId, episodeNumber: number };
    throw error;
  }
}

async function writeJsonAtomic(path, value, mode = 0o644) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  const file = await open(temporaryPath, "w", mode);
  try {
    await file.chmod(mode);
    await file.writeFile(`${JSON.stringify(value, null, 2)}\n`);
    await file.sync();
  } finally {
    await file.close();
  }
  await rename(temporaryPath, path);
  const directory = await open(dirname(path), "r");
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

function parseArguments(args) {
  const result = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === "--") continue;
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const name = token.slice(2);
    const next = args[index + 1];
    if (next && !next.startsWith("--")) {
      result.set(name, next);
      index += 1;
    } else {
      result.set(name, true);
    }
  }
  return result;
}

function validateArguments(args) {
  const allowed = new Set([
    "slug",
    "episode",
    "poster-only",
    "reuse-poster",
    "clip-tier",
    "confirm-not-submitted",
    "recover-operation",
    "request-id",
    "status-url",
    "cancel-url",
  ]);
  for (const name of args.keys()) {
    if (!allowed.has(name)) throw new Error(`Unknown argument: --${name}`);
  }
  if (args.has("confirm-not-submitted") && args.has("recover-operation")) {
    throw new Error("Use either --confirm-not-submitted or --recover-operation, not both.");
  }
  const recoveryFields = ["request-id", "status-url", "cancel-url"];
  if (!args.has("recover-operation") && recoveryFields.some((name) => args.has(name))) {
    throw new Error("--request-id, --status-url, and --cancel-url require --recover-operation.");
  }
}

async function applyRecoveryArguments(args) {
  const confirmed = args.get("confirm-not-submitted");
  if (confirmed !== undefined) {
    const operation = requireOperation(confirmed, "--confirm-not-submitted");
    assertSelectedClipOperation(operation);
    if (!submissionIntents[operation] || acceptedHandles[operation]) {
      throw new Error(`No unresolved ${operation} submission can be confirmed as not submitted.`);
    }
    delete submissionIntents[operation];
    await saveCheckpoint();
    console.log(`Cleared the unresolved ${operation} dispatch after explicit operator confirmation.`);
  }

  const recovered = args.get("recover-operation");
  if (recovered === undefined) return;
  const operation = requireOperation(recovered, "--recover-operation");
  assertSelectedClipOperation(operation);
  if (acceptedHandles[operation]) throw new Error(`${operation} already has an accepted request.`);
  const requestId = requireUuid(args.get("request-id"), "--request-id");
  const statusUrl = requireTrustedControlUrl(args.get("status-url"), requestId, "status", apiBaseUrl);
  const cancelValue = args.get("cancel-url");
  const cancelUrl = cancelValue === undefined
    ? undefined
    : requireTrustedControlUrl(cancelValue, requestId, "cancel", apiBaseUrl);
  acceptedHandles[operation] = {
    provider: "higgsfield",
    operation,
    id: requestId,
    statusToken: statusUrl,
    ...(cancelUrl ? { cancelToken: cancelUrl } : {}),
    acceptedAt: submissionIntents[operation]?.startedAt ?? new Date().toISOString(),
  };
  delete submissionIntents[operation];
  await saveCheckpoint();
  console.log(`Recovered ${operation} request ${requestId} from provider-issued control data.`);
}

function requireOperation(value, label) {
  if (!["poster", "clip", "clip-turbo", "clip-standard"].includes(value)) {
    throw new Error(`${label} must be poster, clip, clip-turbo, or clip-standard.`);
  }
  return value;
}

function assertSelectedClipOperation(operation, selectedTier = clipTier) {
  if (operation === "poster") return;
  const selected = clipOperationForTier(selectedTier);
  if (operation !== selected) {
    throw new Error(`${operation} recovery requires --clip-tier ${clipTierForOperation(operation)}.`);
  }
}

function readClipTier(value) {
  if (value === undefined) return "lite";
  if (value !== "lite" && value !== "turbo" && value !== "standard") {
    throw new Error("--clip-tier must be lite, turbo, or standard.");
  }
  return value;
}

function clipOperationForTier(tier) {
  if (tier === "lite") return "clip";
  if (tier === "turbo") return "clip-turbo";
  if (tier === "standard") return "clip-standard";
  throw new Error("Unsupported clip tier.");
}

function clipTierForOperation(operation) {
  if (operation === "clip") return "lite";
  if (operation === "clip-turbo") return "turbo";
  if (operation === "clip-standard") return "standard";
  throw new Error("Unsupported clip operation.");
}

function clipEndpointForTier(tier) {
  return `higgsfield-ai/dop/${readClipTier(tier)}`;
}

function requireUuid(value, label) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    throw new Error(`${label} must be a UUID.`);
  }
  return value;
}

function requireTrustedControlUrl(value, requestId, action, baseUrl) {
  if (typeof value !== "string") throw new Error(`--${action}-url is required for recovery.`);
  const parsed = new URL(value);
  const expectedPath = `/requests/${requestId}/${action}`;
  if (parsed.protocol !== "https:" || parsed.origin !== baseUrl.origin || parsed.pathname !== expectedPath || parsed.search || parsed.hash) {
    throw new Error(`--${action}-url must be the provider-issued Higgsfield ${action} URL for this request.`);
  }
  return parsed.href;
}

function requireSlug(value) {
  if (typeof value !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value)) {
    throw new Error("Pass --slug with a lowercase kebab-case series slug.");
  }
  return value;
}

function requireEpisode(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error("--episode must be a positive integer.");
  return number;
}

function readPositiveNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${label} must be positive.`);
  return number;
}

function readCredential(env) {
  const appCredential = normalizeOptional(env.HIGGSFIELD_API_KEY);
  const officialCredential = normalizeOptional(env.HF_CREDENTIALS);
  if (appCredential && officialCredential && appCredential !== officialCredential) {
    throw new Error("HIGGSFIELD_API_KEY and HF_CREDENTIALS disagree.");
  }
  const value = appCredential ?? officialCredential;
  if (!value) throw new Error("Set HIGGSFIELD_API_KEY or HF_CREDENTIALS in a server-only environment.");
  const separator = value.indexOf(":");
  if (separator <= 0 || separator === value.length - 1 || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error("Higgsfield credentials must use the KEY_ID:KEY_SECRET format.");
  }
  return value;
}

function readApiBaseUrl(value) {
  let parsed;
  try {
    parsed = new URL(value ?? "https://platform.higgsfield.ai");
  } catch {
    throw new Error("HIGGSFIELD_API_BASE_URL must be the exact production or development Higgsfield origin.");
  }
  const allowedOrigins = new Set([
    "https://platform.higgsfield.ai",
    "https://dev-api.higgsfield.com",
  ]);
  if (
    !allowedOrigins.has(parsed.origin)
    || parsed.pathname !== "/"
    || parsed.search
    || parsed.hash
    || parsed.username
    || parsed.password
  ) {
    throw new Error("HIGGSFIELD_API_BASE_URL must be the exact production or development Higgsfield origin.");
  }
  return parsed;
}

function normalizeOptional(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function assertScriptIdentity(value, expectedSeriesId, expectedEpisodeNumber) {
  if (!isRecord(value) || value.seriesId !== expectedSeriesId || value.episodeNumber !== expectedEpisodeNumber) {
    throw new Error("Production script identity does not match the requested series episode.");
  }
}

function estimatedUsdTotal(value) {
  return Object.entries(value).reduce((sum, [operation, estimate]) => {
    if (!isRecord(estimate) || !isDecimal(estimate.usd)) {
      throw new Error(`Persisted ${operation} estimate has an invalid USD amount.`);
    }
    return sum + Number(estimate.usd);
  }, 0);
}

function sanitizePublicEstimates(value) {
  return Object.fromEntries(Object.entries(value).map(([operation, estimate]) => [operation, {
    credits: estimate.credits,
    usd: estimate.usd,
    observedAt: estimate.observedAt,
  }]));
}

function sanitizePublicArtifact(artifact) {
  return {
    kind: artifact.kind,
    endpoint: artifact.endpoint,
    path: artifact.path,
    webPath: artifact.webPath,
    bytes: artifact.bytes,
    sha256: artifact.sha256,
    contentType: artifact.contentType,
  };
}

function imageExtension(artifact) {
  const contentType = artifact.contentType?.split(";", 1)[0]?.toLowerCase();
  if (contentType === "image/png") return ".png";
  if (contentType === "image/webp") return ".webp";
  if (contentType === "image/jpeg" || contentType === "image/jpg") return ".jpg";
  const extension = extname(new URL(artifact.url).pathname).toLowerCase();
  return [".jpg", ".jpeg", ".png", ".webp"].includes(extension) ? extension : ".jpg";
}

function imageExtensionFromContentType(value) {
  const contentType = value?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType === "image/png") return ".png";
  if (contentType === "image/webp") return ".webp";
  if (contentType === "image/jpeg" || contentType === "image/jpg") return ".jpg";
  return undefined;
}

function verifiedMediaContentType(kind, value, url) {
  const normalized = value?.split(";", 1)[0]?.trim().toLowerCase();
  const extension = extname(new URL(url).pathname).toLowerCase();
  if (kind === "image") {
    if (["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(normalized)) return normalized;
    if (!normalized || normalized === "application/octet-stream") {
      if (extension === ".png") return "image/png";
      if (extension === ".webp") return "image/webp";
      if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
    }
    throw new Error("Higgsfield poster download did not return a supported image content type.");
  }
  if (normalized === "video/mp4") return normalized;
  if ((!normalized || normalized === "application/octet-stream") && extension === ".mp4") return "video/mp4";
  throw new Error("Higgsfield clip download did not return MP4 video.");
}

function normalizeImageContentType(value, path) {
  const normalized = value?.split(";", 1)[0]?.toLowerCase();
  if (["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(normalized)) return normalized;
  const extension = extname(path).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  return "image/jpeg";
}

function isUploadEnvelope(value) {
  return isRecord(value)
    && typeof value.public_url === "string"
    && typeof value.upload_url === "string"
    && typeof value.content_type === "string"
    && isRecord(value.upload_headers);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDecimal(value) {
  return typeof value === "string" && /^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(value);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function acquireEpisodeLock(path) {
  await mkdir(dirname(path), { recursive: true });
  try {
    const handle = await open(path, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })}\n`);
    return handle;
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error(`Generation is already locked for this episode. If the prior process crashed, inspect and remove ${relative(path)} manually.`);
    }
    throw error;
  }
}

async function releaseEpisodeLock(handle, path) {
  await handle.close();
  await unlink(path).catch(() => undefined);
}

function relative(path) {
  return path.slice(repositoryRoot.length + 1);
}

export {
  assertSelectedClipOperation,
  buildClipInput,
  buildPosterInput,
  clipEndpointForTier,
  clipOperationForTier,
  estimatedUsdTotal,
  imageExtensionFromContentType,
  hasUnresolvedIntent,
  operationDisposition,
  readApiBaseUrl,
  readClipTier,
  readCredential,
  readMotionPrompt,
  readPosterPrompt,
  sanitizePublicArtifact,
  sanitizePublicEstimates,
  requireOperation,
  verifiedMediaContentType,
  writeJsonAtomic,
};
