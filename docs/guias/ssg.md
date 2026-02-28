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
  return [{ params: { slug: 'mi-post' } }];
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

## Comportamiento en producción

Al usar `suamox preview`:

- Si existe HTML en `dist/static` para la ruta solicitada, se sirve ese HTML.
- Si no existe, se cae a render SSR dinámico.

Esto permite mezclar páginas estáticas y dinámicas en el mismo proyecto.
