# Dramatic web

This Next.js App Router project is the Vercel-ready public landing page. It serves local generated artwork, responsive metadata, manifest/robots/sitemap routes, live GitHub repository statistics with an unavailable state, and the server-only `src/lib/higgsfield.ts` application facade.

Run commands from the repository root:

```bash
pnpm dev:web
pnpm --filter @dramatic/web lint
pnpm --filter @dramatic/web typecheck
pnpm --filter @dramatic/web build
```

The build regenerates `src/data/stories.generated.ts` from the root `series/` catalog. Deploy on Vercel with `apps/web` as the Root Directory and Node.js 24.x. Set `NEXT_PUBLIC_SITE_URL` to the production origin and `NEXT_PUBLIC_GITHUB_REPOSITORY_URL` to the public repository URL.

Higgsfield credentials are server-only. The official TypeScript SDK adapter lives in `packages/higgsfield`; browser and mobile code must never import vendor credentials or payloads. Development-dashboard credentials must select the development API origin, while production credentials use the production origin.
