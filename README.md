# Suamox Framework

Meta-framework with SSR/SSG, filesystem routing, and layouts on Vite, React, and Hono.

## Status

Active development. Phases 0-6 are implemented; Islands (Phase 7) are planned.

## Quick Start

```bash
pnpm dlx @suamox/create-app my-suamox-app
cd my-suamox-app
pnpm install
pnpm run dev
```

See `docs/getting-started.md` for manual setup and details.

## Project Structure

```
suamox/
  packages/
    vite-plugin-pages/   # Filesystem routing plugin
    ssr-runtime/         # SSR/SSG runtime
    hono-adapter/        # Hono server adapter
    head/                # Head manager (SSR/SSG/CSR)
    router/              # Client router
    cli/                 # CLI: dev/build/ssg/preview
    create-app/          # Project scaffold
  examples/
    basic/               # Example project
  docs/                  # Documentation
  PLAN.md                # Implementation plan
  CONVENTIONS_v1.md      # Framework conventions (frozen)
```

## Development Setup

### Prerequisites

- Node.js 18+ or Bun 1.0+
- pnpm 10+

### Install

```bash
pnpm install
```

### Scripts

```bash
pnpm dev
pnpm build
pnpm typecheck
pnpm lint
pnpm format
pnpm test
```

## Packages

### `@suamox/vite-plugin-pages`

Filesystem routing with static, dynamic, catch-all, and route groups.

### `@suamox/ssr-runtime`

Route matching, loaders, SSR rendering, and SSG prerendering.

### `@suamox/hono-adapter`

Hono dev server + production SSR handler.

### `@suamox/head`

Head metadata management across SSR/SSG/CSR.

### `@suamox/router`

Client-side router for smooth navigations.

### `@suamox/cli`

Standardized `dev/build/ssg/preview` commands.

### `@suamox/create-app`

Project scaffold with minimal starter template.

## Roadmap

- [x] Phase 0: Design decisions and conventions
- [x] Phase 1: Routing and manifest
- [x] Phase 2: SSR runtime
- [x] Phase 3: Hono adapter (Dev + Prod)
- [x] Phase 4: SSG (Prerender)
- [x] Phase 5: Layouts
- [x] Phase 6: CLI + Create-app
- [ ] Phase 7: Islands (Optional)

See `PLAN.md` for details.

## License

MIT
