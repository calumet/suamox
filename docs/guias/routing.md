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

## Configuración del plugin

En `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import suamoxPages from '@calumet/suamox-vite-plugin-pages';

export default defineConfig({
  plugins: [
    react(),
    suamoxPages({
      pagesDir: 'src/pages',
      extensions: ['.tsx', '.ts'],
      defaultMode: 'ssr', // 'ssr' | 'ssg' | 'csr'
    }),
  ],
});
```
