import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
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
  requireOperation,
  sanitizePublicArtifact,
  sanitizePublicEstimates,
  verifiedMediaContentType,
  writeJsonAtomic,
} from "./generate-pilot-media.mjs";

test("reads the checked-in production shot prompt fields", () => {
  const script = {
    shots: [{
      soulKeyframePrompt: "A sufficiently detailed vertical cinematic keyframe prompt for testing.",
      dopMotionPrompt: "A slow controlled camera push with restrained natural movement.",
    }],
  };
  assert.equal(readPosterPrompt(script), script.shots[0].soulKeyframePrompt);
  assert.equal(readMotionPrompt(script), script.shots[0].dopMotionPrompt);
});

test("builds exact vertical Soul and minimal DoP Lite inputs", () => {
  assert.deepEqual(buildPosterInput("Vertical funeral drama key art"), {
    prompt: "Vertical funeral drama key art",
    resolution: "720p",
    aspect_ratio: "9:16",
    batch_size: 1,
    enhance_prompt: true,
  });
  assert.deepEqual(
    buildClipInput("Slow push toward the matching rings", "https://cdn.example/poster.jpg"),
    {
      prompt: "Slow push toward the matching rings",
      image_url: "https://cdn.example/poster.jpg",
    },
  );
});

test("maps clip tiers to isolated checkpoint keys and allowlisted endpoints", () => {
  assert.equal(readClipTier(undefined), "lite");
  assert.equal(clipOperationForTier("lite"), "clip");
  assert.equal(clipOperationForTier("turbo"), "clip-turbo");
  assert.equal(clipOperationForTier("standard"), "clip-standard");
  assert.equal(clipEndpointForTier("lite"), "higgsfield-ai/dop/lite");
  assert.equal(clipEndpointForTier("turbo"), "higgsfield-ai/dop/turbo");
  assert.equal(clipEndpointForTier("standard"), "higgsfield-ai/dop/standard");
  assert.throws(() => readClipTier("premium"), /lite, turbo, or standard/u);
});

test("Turbo recovery is recognized and an unresolved Turbo intent blocks replay", () => {
  assert.equal(requireOperation("clip-turbo", "--recover-operation"), "clip-turbo");
  assert.doesNotThrow(() => assertSelectedClipOperation("clip-turbo", "turbo"));
  assert.throws(
    () => assertSelectedClipOperation("clip-turbo", "lite"),
    /requires --clip-tier turbo/u,
  );
  const liteHandle = { id: "lite-request" };
  const turboHandle = { id: "recovered-turbo-request" };
  const intents = { "clip-turbo": { state: "ambiguous" } };
  assert.equal(hasUnresolvedIntent(intents, "clip-turbo"), true);
  assert.deepEqual(operationDisposition({ clip: liteHandle }, intents, "clip"), {
    state: "resume",
    handle: liteHandle,
  });
  assert.deepEqual(operationDisposition({ clip: liteHandle }, intents, "clip-turbo"), {
    state: "blocked",
  });
  assert.deepEqual(
    operationDisposition({ clip: liteHandle, "clip-turbo": turboHandle }, {}, "clip-turbo"),
    { state: "resume", handle: turboHandle },
  );
});

test("credential selection rejects conflicts without including either value", () => {
  assert.equal(readCredential({ HIGGSFIELD_API_KEY: "id:secret" }), "id:secret");
  assert.throws(
    () => readCredential({ HIGGSFIELD_API_KEY: "first:secret", HF_CREDENTIALS: "second:secret" }),
    (error) => {
      assert.equal(error.message, "HIGGSFIELD_API_KEY and HF_CREDENTIALS disagree.");
      assert.doesNotMatch(error.message, /first|second|secret/u);
      return true;
    },
  );
});

test("API base URL accepts only the exact production and development origins", () => {
  assert.equal(readApiBaseUrl(undefined).href, "https://platform.higgsfield.ai/");
  assert.equal(readApiBaseUrl("https://dev-api.higgsfield.com").href, "https://dev-api.higgsfield.com/");
  for (const unsafe of [
    "https://example.com",
    "https://dev-api.higgsfield.com/extra",
    "https://user:secret@dev-api.higgsfield.com",
    "http://dev-api.higgsfield.com",
  ]) {
    assert.throws(() => readApiBaseUrl(unsafe), /exact production or development/u);
  }
});

test("budget total includes every persisted operation estimate", () => {
  assert.equal(estimatedUsdTotal({ poster: { usd: "0.094" }, clip: { usd: "1.206" } }), 1.3);
  assert.throws(() => estimatedUsdTotal({ poster: { usd: "NaN" } }), /invalid USD/u);
});

test("public receipts expose only the durable audit fields", () => {
  const artifact = sanitizePublicArtifact({
    kind: "video",
    requestId: "private-request-id",
    remoteUrl: "https://temporary.example/video.mp4",
    endpoint: "higgsfield-ai/dop/lite",
    path: "apps/mobile/assets/videos/example.mp4",
    webPath: "apps/web/public/media/example.mp4",
    bytes: 42,
    sha256: "abc",
    contentType: "video/mp4",
    extra: "not-public",
  });
  assert.deepEqual(Object.keys(artifact), [
    "kind",
    "endpoint",
    "path",
    "webPath",
    "bytes",
    "sha256",
    "contentType",
  ]);
  assert.equal(JSON.stringify(artifact).includes("private-request-id"), false);
  assert.equal(JSON.stringify(artifact).includes("temporary.example"), false);

  assert.deepEqual(sanitizePublicEstimates({
    poster: { credits: "1.5", usd: "0.094", observedAt: "2026-08-26T00:00:00.000Z", correlationId: "private" },
  }), {
    poster: { credits: "1.5", usd: "0.094", observedAt: "2026-08-26T00:00:00.000Z" },
  });
});

test("download media types are verified and mapped to matching extensions", () => {
  assert.equal(verifiedMediaContentType("image", "image/png; charset=binary", "https://cdn.example/out"), "image/png");
  assert.equal(verifiedMediaContentType("video", "application/octet-stream", "https://cdn.example/out.mp4"), "video/mp4");
  assert.equal(imageExtensionFromContentType("image/webp"), ".webp");
  assert.throws(
    () => verifiedMediaContentType("video", "text/html", "https://cdn.example/out.mp4"),
    /did not return MP4/u,
  );
});

test("atomic checkpoint writes persist JSON with private permissions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dramatic-generation-test-"));
  try {
    const path = join(directory, "checkpoint.json");
    await writeJsonAtomic(path, { state: "dispatching" }, 0o600);
    assert.deepEqual(JSON.parse(await readFile(path, "utf8")), { state: "dispatching" });
    assert.equal((await stat(path)).mode & 0o777, 0o600);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
