# Suamox Framework

A meta-framework with SSR/SSG, filesystem routing, and islands architecture built on Vite, React, and Hono.

## Status

🚧 **In Development** - Currently implementing Phase 0 (Design Decisions)

## Project Structure

```
suamox/
├── packages/
│   ├── vite-plugin-pages/    # Filesystem routing plugin
│   ├── ssr-runtime/           # SSR and SSG runtime
│   └── hono-adapter/          # Hono server adapter
├── examples/
│   └── basic/                 # Basic example project
├── docs/                      # Documentation
├── PLAN.md                    # Implementation plan
└── CONVENTIONS_v1.md          # Framework conventions (frozen)
```

## Development Setup

### Prerequisites

- Node.js 18+ or Bun 1.0+
- pnpm 10+

### Install Dependencies

```bash
pnpm install
```

### Build All Packages

```bash
pnpm build
```

### Development Mode

```bash
pnpm dev
```

### Type Check

```bash
pnpm typecheck
```

### Lint

```bash
pnpm lint
```

### Format

```bash
pnpm format
```

## Packages

### [@suamox/vite-plugin-pages](./packages/vite-plugin-pages)

Vite plugin for filesystem-based routing with support for:

- Static routes
- Dynamic parameters `[slug]`
- Catch-all routes `[...path]`
- Route groups `(group)`

**Status:** Phase 1 (Planned)

### [@suamox/ssr-runtime](./packages/ssr-runtime)

Runtime for server-side rendering and static site generation:

- Route matching
- Data loading with `loader()`
- SSR rendering with React
- SSG pre-rendering

**Status:** Phase 2 (Planned)

### [@suamox/hono-adapter](./packages/hono-adapter)

Hono server adapter with:

- Development server with HMR
- Production SSR server
- Middleware hooks

**Status:** Phase 3 (Planned)

## Roadmap

- [x] **Phase 0:** Design decisions and conventions
- [ ] **Phase 1:** Routing and manifest
- [ ] **Phase 2:** SSR runtime
- [ ] **Phase 3:** Hono adapter (Dev + Prod)
- [ ] **Phase 4:** SSG (Pre-render)
- [ ] **Phase 5:** Layouts
- [ ] **Phase 6:** CLI + Create-app
- [ ] **Phase 7:** Islands (Optional)

See [PLAN.md](./PLAN.md) for detailed implementation plan.

## License

MIT
