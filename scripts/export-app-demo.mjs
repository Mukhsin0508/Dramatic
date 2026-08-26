import { execSync } from "node:child_process";
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Builds the Expo app for web and stages it under the landing page's public
// directory, so the site can embed the real, interactive app at /app.
// Skip with SKIP_APP_DEMO=1 (e.g. fast local iterations on the landing page).

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mobileDirectory = join(repositoryRoot, "apps", "mobile");
const exportDirectory = join(mobileDirectory, "dist-web");
const targetDirectory = join(repositoryRoot, "apps", "web", "public", "app");

if (process.env.SKIP_APP_DEMO === "1") {
  if (!existsSync(targetDirectory)) {
    console.warn("[export-app-demo] skipped, and no existing demo found at apps/web/public/app");
  } else {
    console.log("[export-app-demo] skipped, reusing existing apps/web/public/app");
  }
  process.exit(0);
}

console.log("[export-app-demo] exporting the Expo app for web…");
execSync("npx expo export --platform web --output-dir dist-web", {
  cwd: mobileDirectory,
  stdio: "inherit",
});

rmSync(targetDirectory, { recursive: true, force: true });
cpSync(exportDirectory, targetDirectory, { recursive: true });
console.log(`[export-app-demo] staged ${exportDirectory} -> ${targetDirectory}`);
