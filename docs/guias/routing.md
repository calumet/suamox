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

## Prioridad

Cuando varias rutas casan la misma URL, gana la más específica:

1. **Más segmentos** antes que menos.
2. **Estático** antes que dinámico, segmento a segmento: `/admin/correos` le gana a `/:lang/correos`.
3. **Index** antes que un hermano dinámico del mismo largo: `[lang]/index.tsx` (`/:lang`) le gana a `[slug].tsx` (`/:slug`).
4. **Catch-all** siempre al final.

La regla 3 existe porque sin ella las dos puntúan igual y desempataba el orden alfabético del path generado, así que renombrar `[slug]` a `[articulo]` cambiaba qué página servía `/en`.

Lo que sí queda empatado son dos patrones con la **misma forma** —`/blog/:slug` y `/blog/:id`—, que casan exactamente las mismas URLs. Ahí cuál gane es arbitrario se ordene como se ordene; el orden es estable entre builds, pero si te encuentras en ese caso, el arreglo es no tener las dos rutas.

## Segmento opcional (deprecado)

> **Deprecado.** `[[lang]]/about.tsx` sigue funcionando y avisa al arrancar. Se quita en una versión próxima. Usa [reroute](./reroute.md).

Un segmento entre dobles corchetes compilaba a dos rutas, una sin el parámetro y otra con él, para tener un idioma por defecto sin prefijo. **No sirve para eso en cuanto la app tiene páginas con parámetro**: `[[lang]]/[slug].tsx` genera `/:lang` y `/:slug`, que casan las mismas URLs, y nada en el patrón permite saber si `/mision-y-vision` es el idioma o el slug.

Con reroute el idioma no entra a la tabla de rutas, así que la ambigüedad no llega a existir:

```txt
src/
  reroute.ts
  pages/
    ingresar.tsx      ->  /ingresar  y  /en/ingresar
    [slug].tsx        ->  /:slug     y  /en/:slug
```

### Migración

Mueve la página fuera de la carpeta opcional y lee el prefijo de `url`, que llega intacta al loader:

```diff
- // src/pages/[[lang]]/ingresar.tsx
- export function loader({ params }: LoaderContext) {
-   return { idioma: params.lang ?? "es" };
- }
+ // src/pages/ingresar.tsx
+ export function loader({ url }: LoaderContext) {
+   return { idioma: idiomaDe(url) };
+ }
```

Y declara el prefijo una vez en `src/reroute.ts`. Ver [reroute](./reroute.md).

## El root de la app

`src/pages/root.tsx` envuelve todas las rutas y va por encima de la cadena de layouts. Es el sitio para lo que la app necesita en cada pantalla —proveedores de contexto, i18n, tema— porque a diferencia de un layout **no se lo salta nadie**, ni siquiera una página con `layout = false`.

```tsx
// src/pages/root.tsx
export function loader({ url }: LoaderContext) {
  return { idioma: idiomaDeLaUrl(url) };
}

export default function Root({ children }: { children: ReactNode }) {
  const { idioma } = useRouteLoaderData<typeof loader>("root")!;
  return <I18nProvider idioma={idioma}>{children}</I18nProvider>;
}
```

Puede tener `loader`, que corre en cada petición como el de cualquier layout, y sus datos se leen con `useRouteLoaderData("root")` desde cualquier nivel. Un `redirect()` desde ahí aplica a toda la app.

Es opcional, y solo cuenta en la raíz de `pages/`: un `root.tsx` en una subcarpeta es una página normal.

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

### Salirse del layout

Una página puede exportar `layout = false` para renderizarse sin la cadena de layouts de su carpeta:

```tsx
// src/pages/[[lang]]/ingresar.tsx
export const layout = false;

export default function Ingresar() {
  return <h1>Ingresar</h1>;
}
```

Es por página: sus hermanas de la misma carpeta conservan el layout. El valor tiene que ser el literal `false`, no una variable ni una expresión, porque se lee al generar las rutas y no en tiempo de ejecución. Los loaders de los layouts que se salta tampoco se ejecutan.

La bandera se salta los `layout.tsx`, **no** el `root.tsx`: la página sigue dentro de la app, solo sale del cromo de su carpeta.

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
