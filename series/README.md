# Series catalog

Every top-level `*.json` file in this directory is a self-contained launchable series bible. The catalog is intentionally data-driven: add another JSON file that satisfies `SeriesBibleSchema`, then add matching artwork at `apps/mobile/assets/images/stories/<slug>.(jpg|jpeg|webp|png)` and `apps/web/public/media/<slug>.png`. No TypeScript registry needs changing.

Run `pnpm sync:content` to regenerate the typed mobile and landing-page catalogs, then `pnpm check:content` to validate every bible, generated-catalog parity, sequential episode numbers, vote options, and catalog-wide ID/slug uniqueness. Keep the filename equal to the series slug so media and application routes can use the same stable identifier.

`presentation/catalog.json` is an optional demo/runtime snapshot for featured order, live episode copy, audience counts, and lock state. A new bible works without an entry there; the catalog generator falls back to its latest outlined episode. Production will replace this snapshot with API data rather than mixing vote tallies into the canonical story bible.

The outlined episodes are story guardrails, not immutable generated scripts. A winning vote's `generationDirective` is applied to the following episode while the bible's world rules, character objectives, season targets, and visual style preserve continuity.

Production-ready episodes live in `scripts/<episode-id>.json`. Each script is linked back to its bible and episode blueprint and contains a contiguous 60–90 second, ten-shot timeline, dialogue-matched subtitle cues, locked Soul character references, per-shot Soul keyframes and DoP motion prompts, continuity notes, and the same end vote defined by the episode. `pnpm check:content` validates both the script structure and those cross-file links before catalog parity is checked.
