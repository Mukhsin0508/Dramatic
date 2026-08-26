# Dramatic

Dramatic is an open-source, audience-directed vertical drama platform. Viewers watch short episodes, vote on the next turn, and return to a story whose next installment is generated from the winning choice while a structured series bible protects continuity.

This repository contains the Expo native application, the Vercel-ready web experience and API boundary, provider-neutral contracts, a swappable Higgsfield integration, and eight data-driven launch series:

- **Opening Night** — a singer meets the flawless replacement already wearing her face.
- **Crown of Rust** — a salvage diver wakes the last knight of a drowned kingdom.
- **Midnight Ramen** — a sealed letter connects three sleepless strangers to a missing woman.
- **Neon Harvest** — a rooftop farmer's impossible seed draws two dangerous visitors.
- **The Last Alibi** — a locked-courthouse murder mystery.
- **Borrowed Vows** — a fake-wedding romance with a very real license.
- **The Heir Upstairs** — a hidden-heir romance inside a threatened apartment building.
- **Two Rings at the Funeral** — two apparent widows follow a ringing phone into a conspiracy.

## Architecture

```text
apps/
  mobile/            Expo SDK 57 + Expo Router app for iOS and Android
  web/               Next.js App Router landing page and server-only vendor facade
packages/
  contracts/         Zod schemas and TypeScript types shared at network boundaries
  design-tokens/     Framework-neutral visual primitives
  higgsfield/        Server-only official SDK wrapper, safe lifecycle, and test doubles
series/              Validated story bibles, production scripts, and generation receipts
scripts/             Content-catalog sync and cost-capped pilot-media generation
```

The mobile application never calls an AI vendor directly. Production route handlers and workers will expose Dramatic's own API, validate provider-neutral contracts, and delegate generation work through [`apps/web/src/lib/higgsfield.ts`](apps/web/src/lib/higgsfield.ts). Provider credentials stay on the server. Generated provider payloads must be mapped into `GenerationJob`; they must not leak into mobile or content schemas.

Generation is modeled as an asynchronous job: create a job, receive a stable ID, and poll or process a verified webhook until it succeeds or fails. The Higgsfield package binds this lifecycle to the official `@higgsfield/client/v2` SDK while keeping model endpoints at the composition boundary. Production implementations should persist jobs, process webhook deliveries idempotently, copy expiring outputs to durable object storage, and serve video from a CDN rather than proxying it through a Vercel Function.

The Expo runtime uses native video playback when a generated MP4 exists and an explicit production-state poster when it does not. Likes, saved stories, cliffhanger choices, and watch progress persist locally across relaunches; account-synced state can replace that store behind the same experience boundary later.

## Prerequisites

- Node.js 24 LTS. The repository pins `24.19.0` for local tools and `24.x` for Vercel.
- pnpm 11.24.0, pinned through the root `packageManager` field.
- For native builds: Xcode 26.4+ for iOS or a current Android Studio installation with API 36.
- A development build is recommended for the Expo app; Expo Go is not the production development environment.

If your Node installation does not bundle Corepack, install pnpm 11.24.0 through the official standalone installer or npm before continuing.

## Setup

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

`pnpm dev` starts persistent workspace development tasks. The focused commands are:

```bash
pnpm dev:web       # Next.js at http://localhost:3000
pnpm dev:mobile    # Expo development server
```

For a physical phone, replace `localhost` in `EXPO_PUBLIC_API_BASE_URL` with a LAN-reachable address. Anything prefixed `EXPO_PUBLIC_` or `NEXT_PUBLIC_` is embedded into a client bundle and must never contain a secret.

## Commands

```bash
pnpm build          # Build every workspace that exposes a build task
pnpm lint           # Run workspace linters
pnpm typecheck      # Strict TypeScript checks
pnpm test           # Unit and contract tests
pnpm check:content  # Validate every JSON series bible and catalog identity
pnpm generate:pilot -- --slug two-rings-at-the-funeral --episode 1
pnpm clean          # Remove workspace build output
```

Before a pull request, run `pnpm lint && pnpm typecheck && pnpm test && pnpm build`. CI runs the same sequence with the committed lockfile and a frozen install.

## Environment

Copy `.env.example` and set values per environment:

| Variable | Visibility | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | public | Canonical web origin. |
| `NEXT_PUBLIC_GITHUB_REPOSITORY_URL` | public | Repository CTA and live-star source. |
| `EXPO_PUBLIC_API_BASE_URL` | public | Native app's Dramatic API base URL. |
| `HIGGSFIELD_API_KEY` | secret | Server-side `KEY_ID:KEY_SECRET` provider credential. |
| `HIGGSFIELD_API_BASE_URL` | server | Exact Higgsfield origin; use `https://dev-api.higgsfield.com` for development keys. |
| `HIGGSFIELD_MAX_USD` | server | Maximum summed provider estimate allowed before pilot submission; defaults to `5`. |

The server-only package binds the official `@higgsfield/client/v2` SDK behind Dramatic's provider-neutral generation interface. The checked-in pilot generator requests a 720p, 9:16 Soul v2 Standard keyframe, then maps the selected DoP or Seedance Fast tier to its documented input. Future model additions remain caller-supplied so an OpenAPI-generated operation map can replace them without changing mobile or content contracts.

## Content workflow

Series are not registered in application code. Add `series/<slug>.json`, place its mobile and web artwork under the same stable slug, and run `pnpm sync:content`. The generator refreshes both typed catalogs; `pnpm check:content` fails if either output drifts. `SeriesBibleSchema` checks character identity, sequential outlined episodes, branching vote options, generation directives, visual continuity, and season targets. See [`series/README.md`](series/README.md) for the compact authoring contract.

Vote results should append a winning option's `generationDirective` to the following episode request. Do not mutate the bible to hold runtime tallies or job state; those belong in durable application storage and use the `VoteWindow`, `VoteTally`, `Episode`, and `GenerationJob` contracts.

### Generate a pilot poster and clip

The checked-in pilot tool uses the current Soul 2 text-to-image endpoint and an allowlisted DoP image-to-video tier. It estimates each request before submission, enforces the summed USD cap, saves accepted request handles immediately, downloads completed output locally, and writes a sanitized public receipt without provider URLs or request IDs.

Put the server-only Higgsfield values in the ignored root `.env.local` or `apps/web/.env.local`, then run:

```bash
pnpm generate:pilot -- --slug two-rings-at-the-funeral --episode 1
```

Use `--poster-only` to stop after key art or `--reuse-poster` to animate an existing local poster. Clips default to `--clip-tier lite`; `turbo`, `standard`, and `seedance-fast` are also allowlisted. Each tier keeps its own endpoint/input-bound request, estimate, ambiguity checkpoint, and durable variant file. A completed tier never replaces the active app clip automatically. DoP tiers use the first shot's five-second motion prompt; the ten-second `pilotMotionPrompt` is reserved for Seedance Fast.

Generate a cost-capped ten-second vertical Seedance draft without changing the active app clip:

```bash
pnpm generate:pilot -- --slug two-rings-at-the-funeral --episode 1 \
  --reuse-poster --clip-tier seedance-fast
```

Add `--publish-clip` to promote that tier when no different active clip exists. Replacing different published bytes requires both `--publish-clip --replace-published-clip`, so a late result from an older tier cannot silently win.

Run `pnpm sync:content` after adding an asset with a new extension.

Use a production credential from [Higgsfield Cloud](https://cloud.higgsfield.ai/api-keys). Credentials created in Higgsfield's development dashboard are not accepted by the production API.

Generation POSTs do not support provider-side idempotency. Before dispatch, the tool writes a private endpoint/input fingerprint under `.dramatic/generation` and takes a per-episode lock. Accepted handles and manual recovery must match that exact binding. If a process dies or the submission response is ambiguous, later runs refuse to submit that operation again. Recover a provider request using the original response values and the same script, poster bytes, and clip tier:

```bash
pnpm generate:pilot -- --slug two-rings-at-the-funeral --episode 1 \
  --recover-operation poster \
  --request-id 00000000-0000-4000-8000-000000000000 \
  --status-url https://platform.higgsfield.ai/requests/00000000-0000-4000-8000-000000000000/status \
  --cancel-url https://platform.higgsfield.ai/requests/00000000-0000-4000-8000-000000000000/cancel
```

Only when the provider account confirms that no request was created, clear the guard with `--confirm-not-submitted poster` or the selected clip operation (`clip`, `clip-turbo`, `clip-standard`, or `clip-seedance-fast`). A legacy poster handle can be upgraded only when its saved endpoint and exact provider-input estimate still match; other unbound legacy handles are retained for audit but refused for automatic resume. A stale `.lock` file is never removed automatically; inspect the recorded PID and remove it only after confirming that process is gone.

## Deployment

### Vercel

Create a Vercel project with **Root Directory** set to `apps/web`. Keep the root `pnpm-lock.yaml` committed; Vercel detects the workspace and installs from the repository root. Select Node.js 24.x and configure server-only variables for Preview and Production separately. The marketing routes can be statically rendered, while generation and webhook route handlers must use the Node.js runtime.

Do not keep an HTTP request open while a video generates. Return `202 Accepted` with a job ID, then poll or use webhook-driven state. Video files belong in durable storage/CDN, not the function filesystem.

### Expo and EAS

Run native commands from `apps/mobile` or use the root filter scripts. Configure `EXPO_PUBLIC_API_BASE_URL` in the EAS development, preview, and production environments. The checked-in `eas.json` provides matching build profiles, production build numbers are managed remotely, and `expo-dev-client` powers development builds. Regenerate `ios/` and `android/` from app configuration rather than committing generated native projects. EAS secrets and Higgsfield credentials must never use the `EXPO_PUBLIC_` prefix.

## Current boundaries

- Mobile experience state is functional and persistent on-device; cross-device accounts, aggregate vote tallies, and server-driven publishing still require an application backend and database.
- The official Higgsfield SDK boundary and cost-capped pilot generator are implemented. **Two Rings at the Funeral** includes a real Soul 2 poster and a real 10-second Seedance Fast development-API teaser generated through this repository.
- Five stories currently have playable media: the 30-second **Opening Night** cold open, the new vertical **Two Rings at the Funeral** teaser, and three six-second Higgsfield teasers imported from the user's OpenBinge media. The remaining stories show an explicit coming-soon state.
- Preview length, caption availability, and video fit are declared in content metadata. The app labels cold opens and teasers honestly; it does not present them as completed 60–90 second episodes or advertise captions that are not present.
- The current generator proves one keyframe-to-video operation with cost checkpoints and durable downloads. Full multi-shot assembly, dialogue, subtitles, sound design, QC, and daily publishing remain worker responsibilities.
- Wallet and paywall surfaces are honest previews until RevenueCat/Stripe products, entitlements, and webhooks are configured; they do not simulate a successful purchase.
- Moderation, durable object storage/CDN, analytics, rate limiting, and production aggregate voting still need deployed providers.

## License

[MIT](LICENSE)
