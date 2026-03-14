# SSG

Suamox soporta prerender de páginas a HTML estático.

## Concepto

SSG se controla por ruta con:

```ts
export const prerender = true;
```

Las rutas con `prerender = true` se renderizan a `dist/static/**/index.html`.

## Rutas dinámicas

Si una ruta dinámica usa prerender, debe exportar `getStaticPaths()`:

```ts
export const prerender = true;

export async function getStaticPaths() {
  return [{ params: { slug: "mi-post" } }];
}
```

## Comandos

Build completo recomendado:

```bash
pnpm run build
```

Este comando hace:

1. `vite build` (cliente)
2. `vite build --ssr ...` (servidor)
3. `suamox ssg` (prerender)

Solo SSG:

```bash
pnpm run build:ssg
```

`build:ssg` requiere que ya existan outputs de cliente y servidor.

## Estructura de salida

Después de build:

```txt
dist/
  client/   # assets del cliente (Vite)
  server/   # bundle SSR
  static/   # HTML prerenderizado + copia de client en static/client
```

## CSS en SSG

Durante `suamox ssg`, el runtime:

- Lee `dist/client/.vite/manifest.json`.
- Resuelve CSS del entry y del módulo de ruta.
- Inyecta `<link rel="stylesheet">` en cada HTML generado.

Esto evita páginas estáticas sin estilos al servir `dist/static`.

## Sin hidratación

Las páginas SSG generan HTML puro, sin JavaScript de cliente. A diferencia de las páginas SSR:

- No incluyen `entry-client.tsx` ni scripts de hidratación de React.
- No inyectan `window.__INITIAL_DATA__`.
- Los estilos CSS sí se incluyen normalmente.

Esto aplica tanto en build (`suamox ssg`) como en desarrollo (`suamox dev`). En dev, las rutas con `prerender = true` se renderizan en el servidor sin enviar scripts de hidratación al browser.

Si necesitas interactividad en una página SSG, considera usar una página SSR (`prerender = false`) en su lugar.

## Base path

Si tu app usa `base` en Vite (e.g. `base: "/grupos/"`), los archivos SSG se generan con el prefijo correspondiente:

```txt
dist/static/
  grupos/
    index.html
    about/
      index.html
```

Los paths de CSS también incluyen el prefijo base automáticamente.

## Comportamiento en producción

Al usar `suamox preview`:

- Si existe HTML en `dist/static` para la ruta solicitada, se sirve ese HTML.
- Si no existe, se cae a render SSR dinámico.

Esto permite mezclar páginas estáticas y dinámicas en el mismo proyecto.
