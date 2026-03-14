# Routing

Suamox usa enrutado por sistema de archivos con base en `src/pages`.

## Reglas principales

- `src/pages/index.tsx` -> `/`
- `src/pages/about.tsx` -> `/about`
- `src/pages/blog/index.tsx` -> `/blog`
- `src/pages/blog/[slug].tsx` -> `/blog/:slug`
- `src/pages/[...all].tsx` -> `/*`
- `src/pages/(admin)/dashboard.tsx` -> `/dashboard`

## Segmentos soportados

- Estático: `about.tsx` -> `/about`
- Dinámico: `[id].tsx` -> `/:id`
- Catch-all: `[...rest].tsx` -> `/*`
- Grupo de rutas: `(grupo)` (no aparece en URL)

## Layouts por carpeta

Si existe `layout.tsx` en un directorio de `pages`, se aplica a las rutas hijas.
Los layouts se encadenan desde raíz hasta hoja.

Ejemplo:

```txt
src/pages/
  layout.tsx
  blog/
    layout.tsx
    [slug].tsx
```

La página `blog/[slug].tsx` se renderiza envuelta por:

1. `src/pages/layout.tsx`
2. `src/pages/blog/layout.tsx`
3. `src/pages/blog/[slug].tsx`

## Página 404

Si defines `src/pages/404.tsx`, Suamox la usa para rutas no encontradas.
Si no existe, se devuelve un fallback HTML básico con status 404.

## Prioridad de rutas

El runtime ordena rutas automáticamente:

1. Más específicas primero (más segmentos).
2. Estáticas antes que dinámicas.
3. Catch-all al final.

No necesitas ordenar archivos manualmente.

## Base path

Si tu aplicación se sirve bajo un subpath (e.g. `https://ejemplo.com/grupos/`), configura `base` en `vite.config.ts`:

```ts
export default defineConfig({
  base: "/grupos/",
  plugins: [react(), suamoxPages()],
});
```

Suamox lee `base` automáticamente de la config de Vite y lo aplica en:

- **Router del cliente**: strip del base antes de resolver rutas.
- **SSR (dev y prod)**: el servidor strip el base antes de hacer match de rutas.
- **SSG**: los archivos HTML se generan bajo `dist/static/grupos/...`.
- **CSS en SSG**: los paths de assets usan el prefijo base.

No necesitas configurar el base en cada paquete individualmente.

### Links con base path

Suamox **no** modifica automáticamente los `href` de los `<a>`. Si tu base es `/grupos`, debes incluir el prefijo manualmente en tus links:

```tsx
// Incorrecto: navega a /about, fuera del base
<a href="/about">About</a>

// Correcto: incluye el base
<a href="/grupos/about">About</a>
```

Para evitar hardcodear el base, puedes usar `import.meta.env.BASE_URL`:

```tsx
<a href={`${import.meta.env.BASE_URL}about`}>About</a>
```

Esto aplica también dentro de páginas generadas con `getStaticPaths`. Los links en el markup de esas páginas deben incluir el base manualmente:

```tsx
// src/pages/blog/[slug].tsx
export function getStaticPaths() {
  return [{ params: { slug: "hola" } }];
}

export default function BlogPost() {
  // Incluir el base en links dentro de páginas SSG
  return <a href={`${import.meta.env.BASE_URL}blog`}>Volver al blog</a>;
}
```

Este es el mismo comportamiento que Astro y Vite: el base se aplica a assets y rutas de salida automáticamente, pero los links en tu markup son responsabilidad del desarrollador.

## Configuración del plugin

En `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import suamoxPages from "@calumet/suamox-vite-plugin-pages";

export default defineConfig({
  plugins: [
    react(),
    suamoxPages({
      pagesDir: "src/pages",
      extensions: [".tsx", ".ts"],
      defaultMode: "ssr", // 'ssr' | 'ssg' | 'csr'
    }),
  ],
});
```
