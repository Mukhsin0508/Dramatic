import { execSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Bundles the live-generation demo endpoint into the Vercel Build Output so
// the static landing page ships with one real serverless function at
// /api/demo/poster. Run after `vercel build`, before `vercel deploy --prebuilt`.

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webDirectory = join(repositoryRoot, "apps", "web");
const functionDirectory = join(webDirectory, ".vercel", "output", "functions", "api", "demo", "poster.func");

// Stage the allowlisted prompt map from the checked-in production scripts.
const prompts = {};
const scriptsDirectory = join(repositoryRoot, "series", "scripts");
for (const file of readdirSync(scriptsDirectory).filter(name => name.endsWith(".json"))) {
  const parsed = JSON.parse(readFileSync(join(scriptsDirectory, file), "utf8"));
  const slug = file.replace(/-\d+\.json$/, "");
  const prompt = parsed.shots?.[0]?.soulKeyframePrompt ?? parsed.posterPrompt;
  if (typeof prompt === "string" && prompt.length > 40) {
    prompts[slug] = { title: parsed.title ?? slug, prompt };
  }
}
if (Object.keys(prompts).length === 0) {
  throw new Error("No poster prompts found under series/scripts — refusing to ship an empty demo.");
}
writeFileSync(join(webDirectory, "functions-src", "demo-prompts.json"), `${JSON.stringify(prompts, null, 2)}\n`);

mkdirSync(functionDirectory, { recursive: true });
execSync(
  [
    "npx -y esbuild@0.25.0",
    "functions-src/demo-poster.mjs",
    "--bundle",
    "--platform=node",
    "--format=esm",
    "--target=node22",
    // CJS dependencies (axios, form-data) require() node builtins at runtime.
    "--banner:js=\"import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);\"",
    `--outfile=${join(functionDirectory, "index.mjs")}`,
  ].join(" "),
  { cwd: webDirectory, stdio: "inherit" },
);

writeFileSync(join(functionDirectory, ".vc-config.json"), `${JSON.stringify({
  runtime: "nodejs22.x",
  handler: "index.mjs",
  launcherType: "Nodejs",
  maxDuration: 300,
  memory: 1024,
}, null, 2)}\n`);

console.log(`[build-demo-function] staged ${functionDirectory} (${Object.keys(prompts).join(", ")})`);
