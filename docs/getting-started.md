# Getting Started

> **Note:** Suamox is currently in development. This documentation will be updated as features are implemented.

## Prerequisites

- Node.js 18+ or Bun 1.0+
- pnpm 10+

## Create a new project (recommended)

```bash
pnpm dlx @suamox/create-app my-suamox-app
cd my-suamox-app
pnpm install
pnpm run dev
```

## Manual Installation

```bash
pnpm add @suamox/vite-plugin-pages @suamox/ssr-runtime @suamox/hono-adapter @suamox/router @suamox/head
pnpm add react react-dom hono @hono/node-server
pnpm add -D @suamox/cli vite @vitejs/plugin-react typescript tsx @types/react @types/react-dom @types/node
```

## Manual Setup

### 1. Configure Vite

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

### 2. Create your first page

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

### 3. Set up the server

Create `server.ts`:

```ts
import { createServer } from '@suamox/hono-adapter';

await createServer({ port: 3000 });
```

### 4. Add scripts to package.json

```json
{
  "scripts": {
    "dev": "suamox dev",
    "build": "suamox build",
    "build:ssg": "suamox ssg",
    "preview": "suamox preview"
  }
}
```

### 5. Start development

```bash
pnpm dev
```

Visit [http://localhost:3000](http://localhost:3000) to see your app!

## Next Steps

- [Routing](./routing.md) - Learn about filesystem-based routing
- [Data Loading](./data-loading.md) - Fetch data with loaders
- [SSR](./ssr.md) - Server-side rendering
- [SSG](./ssg.md) - Static site generation
