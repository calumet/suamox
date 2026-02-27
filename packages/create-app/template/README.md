# __NAME__

Starter app built with Suamox, Vite, React, and Hono.

## Requirements

- Node.js 22+ (24 recommended)
- pnpm 10+

## GitHub Packages Auth

This template already includes a project `.npmrc` with:

```ini
@calumet:registry=https://npm.pkg.github.com
```

You still need authentication in your user-level `~/.npmrc` (or in CI):

```ini
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

`GITHUB_TOKEN` should be a Personal Access Token with package read permissions.

## Quick Start

```bash
pnpm install
pnpm run dev
```

Open `http://localhost:3000`.

## Scripts

- `pnpm run dev`: Start development server with SSR.
- `pnpm run build`: Build client and server bundles.
- `pnpm run build:ssg`: Generate static output (SSG).
- `pnpm run preview`: Preview production output.
- `pnpm run typecheck`: Run TypeScript checks.

## Project Structure

```txt
src/
  entry-client.tsx   # Client bootstrap
  entry-server.tsx   # Server route manifest entry
  pages/
    layout.tsx       # Root layout
    index.tsx        # Home page (/)
server.ts            # Hono server entry
vite.config.ts       # Vite + suamoxPages plugin
```

## Routing Conventions

- Files under `src/pages` define routes.
- `index.tsx` maps to `/`.
- Dynamic params use `[param].tsx`.
- Catch-all routes use `[...all].tsx`.
- Group folders like `(admin)` do not affect URL segments.

## Next Steps

1. Add new pages in `src/pages`.
2. Add `loader()` and `getStaticPaths()` where needed.
3. Update metadata with `<Head>` from `@calumet/suamox-head`.
