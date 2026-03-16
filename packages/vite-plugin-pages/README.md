# @calumet/suamox-vite-plugin-pages

Plugin de Vite para enrutado por sistema de archivos con soporte para rutas dinámicas, catch-all y grupos de rutas.

## Características

- Rutas estáticas (`/about`)
- Parámetros dinámicos (`/blog/:slug`)
- Rutas catch-all (`/*`)
- Grupos de rutas `(admin)` excluidos de la URL
- Soporte para rutas index
- Ordenamiento automático por prioridad de ruta
- Soporte HMR (hot module replacement)
- Soporte TypeScript

## Instalación

```bash
pnpm add @calumet/suamox-vite-plugin-pages
```

## Uso

### 1. Configura Vite

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { suamoxPages } from "@calumet/suamox-vite-plugin-pages";

export default defineConfig({
  plugins: [
    suamoxPages({
      pagesDir: "src/pages", // por defecto
      extensions: [".tsx", ".ts"], // por defecto
    }),
  ],
});
```

### 2. Crea páginas

```txt
src/pages/
  index.tsx            -> /
  about.tsx            -> /about
  blog/
    index.tsx          -> /blog
    [slug].tsx         -> /blog/:slug
  (admin)/
    dashboard.tsx      -> /dashboard
  [...all].tsx         -> /* (catch-all)
```

### 3. Importa rutas

El plugin genera dos módulos virtuales:

#### `virtual:pages` — Módulo cliente

No incluye `loader()` ni `getStaticPaths()`. Usado en `src/entry-client.tsx`:

```ts
import { routes } from "virtual:pages";
```

#### `virtual:pages/server` — Módulo servidor

Incluye `loader()` y `getStaticPaths()` de cada página. Usado en `src/entry-server.tsx`:

```ts
export { routes } from "virtual:pages/server";
```

Cada ruta es un objeto `RouteRecord`:

```ts
// {
//   path: string;
//   component: React.ComponentType;
//   filePath: string;
//   params: string[];
//   isCatchAll: boolean;
//   isIndex: boolean;
//   priority: number;
//   hasLoader?: boolean;        // solo en módulo cliente, indica que la ruta tiene loader
//   loader?: Function;          // solo en módulo servidor
//   getStaticPaths?: Function;  // solo en módulo servidor
// }
```

## Convenciones de Routing

### Rutas estáticas

Los archivos se mapean directamente a URLs:

- `src/pages/about.tsx` -> `/about`
- `src/pages/contact.tsx` -> `/contact`

### Rutas index

Los archivos llamados `index.tsx` representan la raíz de su directorio:

- `src/pages/index.tsx` -> `/`
- `src/pages/blog/index.tsx` -> `/blog`

### Parámetros dinámicos

Encierra segmentos entre corchetes para crear rutas dinámicas:

- `src/pages/blog/[slug].tsx` -> `/blog/:slug`
- `src/pages/users/[id].tsx` -> `/users/:id`

Accede a params en tu componente:

```tsx
// src/pages/blog/[slug].tsx
export default function BlogPost({ params }: { params: { slug: string } }) {
  return <h1>Post: {params.slug}</h1>;
}
```

### Rutas catch-all

Usa `[...param]` para rutas catch-all:

- `src/pages/[...all].tsx` -> `/*`
- `src/pages/docs/[...path].tsx` -> `/docs/*`

```tsx
// src/pages/docs/[...path].tsx
export default function DocsPage({ params }: { params: { path: string[] } }) {
  return <p>Path: {params.path.join("/")}</p>;
}
```

### Grupos de rutas

Encierra nombres de carpetas entre paréntesis para organizar rutas sin afectar la URL:

- `src/pages/(admin)/dashboard.tsx` -> `/dashboard`
- `src/pages/(auth)/login.tsx` -> `/login`

Útil para:

- Organizar rutas relacionadas
- Compartir layouts (feature futura)
- Agrupar lógicamente sin anidar URLs

## Prioridad de Rutas

Las rutas se ordenan automáticamente por prioridad:

1. Más alta: rutas estáticas con más segmentos
2. Alta: rutas dinámicas con más segmentos
3. Media: rutas estáticas más cortas
4. Baja: rutas dinámicas más cortas
5. Más baja: rutas catch-all

Ejemplo de orden:

```txt
/blog/featured     (priority: 210)
/blog/:slug        (priority: 215)
/blog              (priority: 110)
/about             (priority: 110)
/*                 (priority: 101)
/                  (priority: 0)
```

## TypeScript

Agrega esto a tu `vite-env.d.ts`:

```ts
/// <reference types="@calumet/suamox-vite-plugin-pages/client" />
```

O crea `virtual-pages.d.ts`:

```ts
declare module "virtual:pages" {
  import type { RouteRecord } from "@calumet/suamox-vite-plugin-pages";
  export const routes: RouteRecord[];
  export default routes;
}
```

## Soporte HMR

El plugin observa el directorio de páginas y automáticamente:

- Detecta páginas nuevas
- Elimina páginas borradas
- Dispara recarga completa cuando cambian las rutas

## Desarrollo

```bash
# Compilar el plugin
pnpm build

# Modo watch
pnpm dev

# Ejecutar tests
pnpm test

# Ejecutar tests en modo watch
pnpm test:watch

# Generar reporte de cobertura
pnpm test:coverage
```

## Testing

El plugin incluye una suite de tests completa con Vitest, cubriendo:

- Parseo y validación de rutas
- Generación de código
- Ordenamiento y prioridad de rutas
- Reportes de cobertura disponibles con `pnpm test:coverage`

## Licencia

MIT
