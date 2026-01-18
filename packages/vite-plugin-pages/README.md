# @suamox/vite-plugin-pages

Vite plugin for filesystem-based routing with support for dynamic routes, catch-all routes, and route groups.

## Features

- ✅ Static routes (`/about`)
- ✅ Dynamic parameters (`/blog/:slug`)
- ✅ Catch-all routes (`/*`)
- ✅ Route groups `(admin)` - excluded from URL
- ✅ Index routes
- ✅ Automatic route priority sorting
- ✅ HMR support (hot module replacement)
- ✅ TypeScript support

## Installation

```bash
pnpm add @suamox/vite-plugin-pages
```

## Usage

### 1. Configure Vite

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { suamoxPages } from '@suamox/vite-plugin-pages';

export default defineConfig({
  plugins: [
    suamoxPages({
      pagesDir: 'src/pages', // default
      extensions: ['.tsx', '.ts'], // default
    }),
  ],
});
```

### 2. Create Pages

```
src/pages/
├── index.tsx           → /
├── about.tsx           → /about
├── blog/
│   ├── index.tsx       → /blog
│   └── [slug].tsx      → /blog/:slug
├── (admin)/
│   └── dashboard.tsx   → /dashboard
└── [...all].tsx        → /* (catch-all)
```

### 3. Import Routes

```ts
import { routes } from 'virtual:pages';

// routes is an array of RouteRecord objects:
// {
//   path: string;
//   component: React.ComponentType;
//   filePath: string;
//   params: string[];
//   isCatchAll: boolean;
//   isIndex: boolean;
//   priority: number;
// }
```

## Routing Conventions

### Static Routes

Files map directly to URLs:

- `src/pages/about.tsx` → `/about`
- `src/pages/contact.tsx` → `/contact`

### Index Routes

Files named `index.tsx` represent the root of their directory:

- `src/pages/index.tsx` → `/`
- `src/pages/blog/index.tsx` → `/blog`

### Dynamic Parameters

Wrap segments in brackets to create dynamic routes:

- `src/pages/blog/[slug].tsx` → `/blog/:slug`
- `src/pages/users/[id].tsx` → `/users/:id`

Access params in your component:

```tsx
// src/pages/blog/[slug].tsx
export default function BlogPost({ params }: { params: { slug: string } }) {
  return <h1>Post: {params.slug}</h1>;
}
```

### Catch-All Routes

Use `[...param]` for catch-all routes:

- `src/pages/[...all].tsx` → `/*`
- `src/pages/docs/[...path].tsx` → `/docs/*`

```tsx
// src/pages/docs/[...path].tsx
export default function DocsPage({ params }: { params: { path: string[] } }) {
  return <p>Path: {params.path.join('/')}</p>;
}
```

### Route Groups

Wrap folder names in parentheses to organize routes without affecting the URL:

- `src/pages/(admin)/dashboard.tsx` → `/dashboard`
- `src/pages/(auth)/login.tsx` → `/login`

Useful for:

- Organizing related routes
- Sharing layouts (future feature)
- Logical grouping without URL nesting

## Route Priority

Routes are automatically sorted by priority:

1. **Highest**: Static routes with more segments
2. **High**: Dynamic routes with more segments
3. **Medium**: Shorter static routes
4. **Low**: Shorter dynamic routes
5. **Lowest**: Catch-all routes

Example order:

```
/blog/featured     (priority: 210)
/blog/:slug        (priority: 215)
/blog              (priority: 110)
/about             (priority: 110)
/*                 (priority: 101)
/                  (priority: 0)
```

## TypeScript

Add to your `vite-env.d.ts`:

```ts
/// <reference types="@suamox/vite-plugin-pages/client" />
```

Or create `virtual-pages.d.ts`:

```ts
declare module 'virtual:pages' {
  import type { RouteRecord } from '@suamox/vite-plugin-pages';
  export const routes: RouteRecord[];
  export default routes;
}
```

## HMR Support

The plugin watches the pages directory and automatically:

- Detects new pages
- Removes deleted pages
- Triggers full reload when routes change

## Development

```bash
# Build the plugin
pnpm build

# Watch mode
pnpm dev

# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Generate coverage report
pnpm test:coverage
```

## Testing

The plugin includes a comprehensive test suite using Vitest with 26 unit tests covering:

- Route parsing and validation
- Code generation
- Route sorting and priority
- Coverage reports available with `pnpm test:coverage`

## License

MIT
