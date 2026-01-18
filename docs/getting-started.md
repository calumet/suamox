# Getting Started

> **Note:** Suamox is currently in development. This documentation will be updated as features are implemented.

## Prerequisites

- Node.js 18+ or Bun 1.0+
- pnpm 10+

## Installation

The Suamox packages will be published to npm once Phase 1-3 are complete.

```bash
pnpm add @suamox/vite-plugin-pages @suamox/ssr-runtime @suamox/hono-adapter
pnpm add -D vite @vitejs/plugin-react typescript
```

## Quick Start

### 1. Create a new project

```bash
mkdir my-suamox-app
cd my-suamox-app
pnpm init
```

### 2. Install dependencies

```bash
pnpm add @suamox/vite-plugin-pages @suamox/ssr-runtime @suamox/hono-adapter
pnpm add react react-dom hono @hono/node-server
pnpm add -D vite @vitejs/plugin-react typescript @types/react @types/react-dom @types/node
```

### 3. Configure Vite

Create `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { suamoxPages } from '@suamox/vite-plugin-pages';

export default defineConfig({
  plugins: [
    react(),
    suamoxPages({
      pagesDir: 'src/pages',
      extensions: ['.tsx', '.ts'],
    }),
  ],
});
```

### 4. Create your first page

Create `src/pages/index.tsx`:

```tsx
export default function HomePage() {
  return (
    <div>
      <h1>Welcome to Suamox</h1>
      <p>Your first page is ready!</p>
    </div>
  );
}
```

### 5. Set up the server

Create `server.ts`:

```ts
import { createHonoApp } from '@suamox/hono-adapter';
import { serve } from '@hono/node-server';

const app = createHonoApp();

serve({
  fetch: app.fetch,
  port: 3000,
});

console.log('Server running at http://localhost:3000');
```

### 6. Add scripts to package.json

```json
{
  "scripts": {
    "dev": "node server.js",
    "build": "vite build && vite build --ssr src/entry-server.tsx",
    "preview": "NODE_ENV=production node server.js"
  }
}
```

### 7. Start development

```bash
pnpm dev
```

Visit [http://localhost:3000](http://localhost:3000) to see your app!

## Next Steps

- [Routing](./routing.md) - Learn about filesystem-based routing
- [Data Loading](./data-loading.md) - Fetch data with loaders
- [SSR](./ssr.md) - Server-side rendering
- [SSG](./ssg.md) - Static site generation

## Development Status

Suamox is being built in phases:

- [x] Phase 0: Design decisions ✅
- [ ] Phase 1: Routing and manifest (In Progress)
- [ ] Phase 2: SSR runtime
- [ ] Phase 3: Hono adapter
- [ ] Phase 4: SSG
- [ ] Phase 5: Layouts
- [ ] Phase 6: CLI + Create-app
- [ ] Phase 7: Islands (Optional)
