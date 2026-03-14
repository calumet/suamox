# SSR

Suamox usa Hono como servidor y Vite para el flujo de desarrollo.

## Desarrollo (`pnpm run dev`)

`suamox dev` ejecuta `tsx server.ts`.

En `server.ts`:

```ts
import { createServer } from "@calumet/suamox-hono-adapter";

await createServer({ port: 3000 });
```

En desarrollo:

- Se levanta Vite en middleware mode.
- `virtual:pages` se carga en caliente.
- Se renderiza SSR por request.
- HMR de Vite sigue activo para cambios de código.

## Producción (`pnpm run preview`)

`suamox preview` ejecuta `server.ts` con `NODE_ENV=production`.

En producción, el adaptador:

- Sirve assets de `dist/client`.
- Importa `dist/server/entry-server.js`.
- Renderiza SSR con el runtime.
- Inyecta scripts y CSS leyendo el manifest de Vite.
- Si existe HTML estático en `dist/static`, lo sirve como fallback preferente.

## Hooks del adaptador

`createServer` y handlers aceptan hooks opcionales:

- `onRequest(c)`: antes de resolver la página.
- `onBeforeRender(ctx)`: antes de `renderPage`, permite transformar contexto.
- `onAfterRender(result)`: después de render, permite ajustar resultado.

Ejemplo:

```ts
await createServer({
  port: 3000,
  onBeforeRender(ctx) {
    return { ...ctx, pathname: ctx.pathname.toLowerCase() };
  },
});
```

## Endpoint de salud

Siempre está disponible:

- `GET /health` -> `{ "status": "ok" }`

## HTML y datos iniciales

Para páginas SSR (sin `prerender = true`), el runtime genera HTML completo e inyecta:

- `window.__INITIAL_DATA__` con datos serializados de `loader()`.
- `<link rel="stylesheet">` para CSS resuelto desde manifest.
- Scripts y preloads de cliente para hidratación.

Las páginas con `prerender = true` (SSG) no incluyen scripts de hidratación ni `__INITIAL_DATA__`. Solo se sirve el HTML estático con sus estilos CSS.

## Notas de desarrollo

### FOUC en desarrollo

En `dev`, Vite inyecta CSS mediante HMR y puede haber un flash inicial sin estilos
(FOUC) porque los estilos se cargan vía JavaScript.

Para mitigarlo, Suamox detecta imports `.css` en `src/entry-client.tsx` e inyecta
`<link rel="stylesheet">` en el HTML SSR inicial.

Ejemplo recomendado:

```ts
// src/entry-client.tsx
import "./styles/global.css";
```

Si ese archivo existe y Vite lo resuelve, se enlaza automáticamente durante SSR dev.

La referencia final de comportamiento visual sigue siendo
`pnpm run build` + `pnpm run preview`.
