# SSR

Suamox usa Hono como servidor y Vite para el flujo de desarrollo.

## Desarrollo (`pnpm run dev`)

`suamox dev` ejecuta `tsx server.ts`.

En `server.ts`:

```ts
import { createServer } from '@calumet/suamox-hono-adapter';

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

El runtime genera HTML completo e inyecta:

- `window.__INITIAL_DATA__` con datos serializados de `loader()`.
- `<link rel="stylesheet">` para CSS resuelto desde manifest.
- Scripts y preloads de cliente para hidratación.

## Notas de desarrollo

### FOUC en desarrollo

En `dev`, Vite inyecta CSS mediante HMR y puede haber un flash inicial sin estilos
(FOUC) porque los estilos se cargan vía JavaScript.

Para mitigar esto, Suamox recorre automáticamente el grafo de módulos de Vite después
del render SSR y recolecta **todo el CSS** importado (global, por página, por componente)
para inyectarlo inline como `<style data-dev-css>` en el HTML inicial.

Esto cubre:

- Estilos globales importados en `entry-client.tsx` (e.g., `import './styles/global.css'`)
- CSS Modules importados en páginas y layouts
- Cualquier CSS transitivamente importado por componentes
- Tailwind, PostCSS y preprocesadores (se procesan a través del pipeline de Vite)

No se requiere configuración. La recolección ocurre de forma automática en desarrollo.

La referencia final de comportamiento visual sigue siendo
`pnpm run build` + `pnpm run preview`.
