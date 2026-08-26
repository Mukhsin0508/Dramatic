import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  assertAcceptedHandleBinding,
  assertIntentBinding,
  assertPublicationReplacement,
  assertSelectedClipOperation,
  buildClipFingerprintInput,
  buildClipInput,
  buildPosterInput,
  canonicalInputFingerprint,
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

test("uses a shot-length prompt for 5-second DoP and the pilot prompt for Seedance", () => {
  const script = {
    pilotMotionPrompt: "A precisely timed ten-second sequence with three escalating story beats.",
    shots: [{
      dopMotionPrompt: "A five-second push toward her face as her expression tightens.",
    }],
  };
  assert.equal(readMotionPrompt(script, "lite"), script.shots[0].dopMotionPrompt);
  assert.equal(readMotionPrompt(script, "turbo"), script.shots[0].dopMotionPrompt);
  assert.equal(readMotionPrompt(script, "standard"), script.shots[0].dopMotionPrompt);
  assert.equal(readMotionPrompt(script, "seedance-fast"), script.pilotMotionPrompt);
  assert.throws(
    () => readMotionPrompt({ pilotMotionPrompt: script.pilotMotionPrompt }, "lite"),
    /10-second pilotMotionPrompt is reserved for Seedance Fast/u,
  );
});

test("builds exact vertical Soul, DoP, and Seedance Fast inputs", () => {
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
  assert.deepEqual(
    buildClipInput(
      "Three precisely timed thriller beats with restrained natural movement",
      "https://cdn.example/poster.jpg",
      "seedance-fast",
    ),
    {
      prompt: "Three precisely timed thriller beats with restrained natural movement",
      image_url: "https://cdn.example/poster.jpg",
      duration: 10,
      resolution: "720",
      aspect_ratio: "9:16",
      camera_fixed: false,
    },
  );
});

test("maps clip tiers to isolated checkpoint keys and allowlisted endpoints", () => {
  assert.equal(readClipTier(undefined), "lite");
  assert.equal(clipOperationForTier("lite"), "clip");
  assert.equal(clipOperationForTier("turbo"), "clip-turbo");
  assert.equal(clipOperationForTier("standard"), "clip-standard");
  assert.equal(clipOperationForTier("seedance-fast"), "clip-seedance-fast");
  assert.equal(clipEndpointForTier("lite"), "higgsfield-ai/dop/lite");
  assert.equal(clipEndpointForTier("turbo"), "higgsfield-ai/dop/turbo");
  assert.equal(clipEndpointForTier("standard"), "higgsfield-ai/dop/standard");
  assert.equal(
    clipEndpointForTier("seedance-fast"),
    "bytedance/seedance/v1/pro/fast/image-to-video",
  );
  assert.throws(() => readClipTier("premium"), /lite, turbo, standard, or seedance-fast/u);
});

test("Turbo recovery is recognized and an unresolved Turbo intent blocks replay", () => {
  assert.equal(requireOperation("clip-turbo", "--recover-operation"), "clip-turbo");
  assert.doesNotThrow(() => assertSelectedClipOperation("clip-turbo", "turbo"));
  assert.throws(
    () => assertSelectedClipOperation("clip-turbo", "lite"),
    /requires --clip-tier turbo/u,
  );
  const liteEndpoint = "higgsfield-ai/dop/lite";
  const turboEndpoint = "higgsfield-ai/dop/turbo";
  const liteFingerprint = "a".repeat(64);
  const turboFingerprint = "b".repeat(64);
  const liteHandle = {
    id: "lite-request",
    operation: "clip",
    endpoint: liteEndpoint,
    inputFingerprint: liteFingerprint,
  };
  const turboHandle = {
    id: "recovered-turbo-request",
    operation: "clip-turbo",
    endpoint: turboEndpoint,
    inputFingerprint: turboFingerprint,
  };
  const intents = {
    "clip-turbo": {
      state: "ambiguous",
      endpoint: turboEndpoint,
      inputFingerprint: turboFingerprint,
    },
  };
  assert.equal(hasUnresolvedIntent(intents, "clip-turbo"), true);
  assert.deepEqual(operationDisposition(
    { clip: liteHandle },
    intents,
    "clip",
    liteEndpoint,
    liteFingerprint,
  ), {
    state: "resume",
    handle: liteHandle,
  });
  assert.deepEqual(operationDisposition(
    { clip: liteHandle },
    intents,
    "clip-turbo",
    turboEndpoint,
    turboFingerprint,
  ), {
    state: "blocked",
  });
  assert.deepEqual(
    operationDisposition(
      { clip: liteHandle, "clip-turbo": turboHandle },
      {},
      "clip-turbo",
      turboEndpoint,
      turboFingerprint,
    ),
    { state: "resume", handle: turboHandle },
  );
});

test("accepted and recoverable requests are bound to endpoint and canonical input", () => {
  const endpoint = "higgsfield-ai/dop/turbo";
  const inputFingerprint = canonicalInputFingerprint({
    prompt: "A controlled push toward the matching rings.",
    image_url: { content_type: "image/jpeg", sha256: "c".repeat(64) },
  });
  const handle = {
    id: "private-id",
    operation: "clip-turbo",
    endpoint,
    inputFingerprint,
  };
  const intent = { state: "ambiguous", endpoint, inputFingerprint };
  assert.doesNotThrow(() => assertAcceptedHandleBinding(
    handle,
    "clip-turbo",
    endpoint,
    inputFingerprint,
  ));
  assert.doesNotThrow(() => assertIntentBinding(
    intent,
    "clip-turbo",
    endpoint,
    inputFingerprint,
  ));
  assert.throws(
    () => assertAcceptedHandleBinding(
      { id: "legacy", operation: "clip-turbo" },
      "clip-turbo",
      endpoint,
      inputFingerprint,
    ),
    /predates endpoint\/input binding/u,
  );
  assert.throws(
    () => assertAcceptedHandleBinding(
      handle,
      "clip-turbo",
      endpoint,
      "d".repeat(64),
    ),
    /does not match the current endpoint and canonical input/u,
  );
  assert.throws(
    () => assertIntentBinding(
      intent,
      "clip-turbo",
      "higgsfield-ai/dop/standard",
      inputFingerprint,
    ),
    /does not match the current endpoint and canonical input/u,
  );
});

test("clip fingerprints are stable across upload URLs and change with poster bytes", () => {
  const prompt = "A controlled five-second push toward the matching rings.";
  const first = buildClipFingerprintInput(prompt, "a".repeat(64), "image/jpeg", "lite");
  const same = buildClipFingerprintInput(prompt, "a".repeat(64), "image/jpeg", "lite");
  const changedPoster = buildClipFingerprintInput(prompt, "b".repeat(64), "image/jpeg", "lite");
  assert.equal(canonicalInputFingerprint(first), canonicalInputFingerprint(same));
  assert.equal(
    canonicalInputFingerprint({ z: 1, nested: { b: 2, a: 3 } }),
    canonicalInputFingerprint({ nested: { a: 3, b: 2 }, z: 1 }),
  );
  assert.notEqual(canonicalInputFingerprint(first), canonicalInputFingerprint(changedPoster));
  assert.deepEqual(first.image_url, {
    sha256: "a".repeat(64),
    content_type: "image/jpeg",
  });
});

test("publishing never replaces different active bytes without explicit replacement", () => {
  const current = "a".repeat(64);
  const next = "b".repeat(64);
  assert.doesNotThrow(() => assertPublicationReplacement([undefined, undefined], next));
  assert.doesNotThrow(() => assertPublicationReplacement([next, next], next));
  assert.throws(
    () => assertPublicationReplacement([current, current], next),
    /--replace-published-clip/u,
  );
  assert.doesNotThrow(() => assertPublicationReplacement([current, current], next, true));
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
    inputFingerprint: "f".repeat(64),
    tier: "lite",
    path: "apps/mobile/assets/videos/variants/example-lite.mp4",
    webPath: "apps/web/public/media/variants/example-lite.mp4",
    publishedPath: "apps/mobile/assets/videos/example.mp4",
    publishedWebPath: "apps/web/public/media/example.mp4",
    publishedAt: "2026-08-26T00:00:00.000Z",
    bytes: 42,
    sha256: "abc",
    contentType: "video/mp4",
    extra: "not-public",
  });
  assert.deepEqual(Object.keys(artifact), [
    "kind",
    "endpoint",
    "inputFingerprint",
    "tier",
    "path",
    "webPath",
    "publishedPath",
    "publishedWebPath",
    "publishedAt",
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
  assert.equal(verifiedMediaContentType("image", "image/jpg", "https://cdn.example/out"), "image/jpeg");
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
