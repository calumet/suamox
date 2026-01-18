# Contributing to Suamox

Thank you for your interest in contributing to Suamox!

## Development Setup

1. Fork and clone the repository
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Build all packages:
   ```bash
   pnpm build
   ```
4. Run type checking:
   ```bash
   pnpm typecheck
   ```

## Project Structure

```
suamox/
├── packages/           # Core framework packages
│   ├── vite-plugin-pages/   # Filesystem routing plugin
│   ├── ssr-runtime/         # SSR/SSG runtime
│   └── hono-adapter/        # Hono server adapter
├── examples/          # Example projects
├── docs/              # Documentation
└── CONVENTIONS_v1.md  # Framework conventions (frozen)
```

## Development Workflow

### Making Changes

1. Create a new branch for your feature or fix
2. Make your changes in the appropriate package
3. Run type checking: `pnpm typecheck`
4. Run linting: `pnpm lint`
5. Format code: `pnpm format`
6. Build packages: `pnpm build`
7. Run tests: `pnpm test`

### Package Development

Each package has its own development mode:

```bash
# Watch mode for a specific package
cd packages/vite-plugin-pages
pnpm dev

# Or watch all packages in parallel
pnpm dev
```

### Testing Changes

Use the example projects to test your changes:

```bash
cd examples/basic
pnpm dev
```

## Conventions

Please read [CONVENTIONS_v1.md](./CONVENTIONS_v1.md) for the framework's design decisions and conventions. These are frozen for the MVP and should not be changed without discussion.

## Code Style

- Use TypeScript for all code
- Follow the existing code style
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Prefix unused parameters with `_`

## Commit Messages

Use clear, descriptive commit messages:

- `feat: add route matching logic`
- `fix: correct parameter parsing in dynamic routes`
- `docs: update routing documentation`
- `refactor: simplify route priority sorting`
- `test: add tests for catch-all routes`

## Pull Requests

1. Ensure all checks pass (typecheck, build)
2. Update documentation if needed
3. Add tests for new features
4. Reference any related issues

## Questions?

Feel free to open an issue for discussion before starting work on major changes.
