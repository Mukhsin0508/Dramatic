import { createSdkBackedHiggsfieldClient } from "@dramatic/higgsfield";

import prompts from "./demo-prompts.json" with { type: "json" };

// Public, hard-capped generation demo. One Soul keyframe per request, prompt
// allowlisted per story, cost estimated before submission and refused above
// the per-request cap. Per-instance throttles below are a deterrent, not a
// guarantee — the real ceiling is the provider account balance plus the
// per-request cap.

const ENDPOINT = "higgsfield-ai/soul/v2/standard";
const TWISTS = [
  "",
  " Rain streaks the scene, wet reflections everywhere.",
  " Golden dawn light floods in from one side.",
  " Cold neon signage tints every highlight.",
  " Heavy fog, silhouettes barely resolved.",
];

const state = globalThis.__dramaticDemoState ?? {
  lastSubmitAt: 0,
  usdSpent: 0,
  day: "",
  perIp: new Map(),
};
globalThis.__dramaticDemoState = state;

function money(value) {
  return Math.round(value * 100) / 100;
}

function refuse(res, statusCode, code, message) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ error: code, message }));
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4096) throw new Error("body too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return refuse(res, 405, "method_not_allowed", "POST a story slug to generate.");
  }
  if (process.env.DEMO_GENERATION === "off") {
    return refuse(res, 503, "disabled", "Live generation is switched off right now.");
  }
  if (!process.env.HIGGSFIELD_API_KEY) {
    return refuse(res, 503, "not_configured", "Live generation isn’t wired to a provider key yet.");
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return refuse(res, 400, "bad_request", "Send a JSON body.");
  }
  const story = prompts[body?.slug];
  if (!story) {
    return refuse(res, 400, "unknown_story", "Pick one of tonight’s stories.");
  }
  const twist = TWISTS[Number(body?.twist)] ?? "";

  // Per-instance throttles.
  const today = new Date().toISOString().slice(0, 10);
  if (state.day !== today) {
    state.day = today;
    state.usdSpent = 0;
    state.perIp.clear();
  }
  const dailyCap = Number(process.env.DEMO_DAILY_MAX_USD || 2);
  if (state.usdSpent >= dailyCap) {
    return refuse(res, 429, "daily_cap", "Today’s community generation budget is spent. Come back tomorrow.");
  }
  const now = Date.now();
  if (now - state.lastSubmitAt < 45_000) {
    return refuse(res, 429, "busy", "Another scene is rendering. Try again in a minute.");
  }
  const ip = String(req.headers["x-forwarded-for"] || "local").split(",")[0].trim();
  const ipCount = state.perIp.get(ip) ?? 0;
  if (ipCount >= 4) {
    return refuse(res, 429, "ip_cap", "You’ve forged your scenes for today — leave some budget for the next visitor.");
  }

  const baseUrl = process.env.HIGGSFIELD_API_BASE_URL || "https://platform.higgsfield.ai";
  const input = {
    prompt: `${story.prompt}${twist}`,
    resolution: "720p",
    aspect_ratio: "9:16",
    batch_size: 1,
    enhance_prompt: true,
  };

  // Estimate first; refuse anything above the per-request cap.
  const perRequestCap = Number(process.env.DEMO_MAX_USD || 0.15);
  let estimate;
  try {
    const estimateResponse = await fetch(new URL(`/estimate/${ENDPOINT}`, baseUrl), {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Key ${process.env.HIGGSFIELD_API_KEY}`,
        "Content-Type": "application/json",
        "User-Agent": "dramatic-web-demo/0.1",
      },
      body: JSON.stringify(input),
    });
    if (!estimateResponse.ok) {
      return refuse(res, 502, "estimate_failed", "The studio isn’t answering. Nothing was submitted.");
    }
    estimate = await estimateResponse.json();
  } catch {
    return refuse(res, 502, "estimate_failed", "The studio isn’t answering. Nothing was submitted.");
  }
  const usd = Number(estimate?.usd);
  if (!Number.isFinite(usd) || usd <= 0 || usd > perRequestCap) {
    return refuse(res, 502, "over_cap", "This scene priced above the demo cap. Nothing was submitted.");
  }

  state.lastSubmitAt = now;
  state.perIp.set(ip, ipCount + 1);
  state.usdSpent = money(state.usdSpent + usd);

  try {
    const client = createSdkBackedHiggsfieldClient({
      endpoints: { poster: ENDPOINT },
      config: {
        baseUrl,
        requestTimeoutMs: 60_000,
        userAgent: "dramatic-web-demo/0.1",
      },
    });
    const handle = await client.submit("poster", input);
    const terminal = await client.wait(handle, {
      timeoutMs: Number(process.env.DEMO_WAIT_MS || 280_000),
      initialDelayMs: 2_000,
      maxDelayMs: 6_000,
    });
    if (terminal.status !== "completed") {
      return refuse(res, 504, "incomplete", "The scene is still rendering — the budget for it was reserved. Try again shortly.");
    }
    const artifact = terminal.artifacts?.find(item => item.kind === "image");
    if (!artifact?.url) {
      return refuse(res, 502, "no_image", "The provider finished without an image.");
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({
      imageUrl: artifact.url,
      usd: money(usd),
      story: story.title,
    }));
  } catch (error) {
    console.error("demo-poster generation failed:", error?.code ?? "", error?.message ?? error);
    return refuse(res, 502, "generation_failed", "Generation failed after submission; the estimate may still be charged.");
  }
}
