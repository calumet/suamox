# Router

Suamox usa `@calumet/suamox-router` como router del cliente para navegación SPA con hidratación SSR.

## Arranque

En `src/entry-client.tsx`, importa las rutas del módulo cliente (sin loaders):

```tsx
import { startRouter } from "@calumet/suamox-router";
import { routes } from "virtual:pages";

void startRouter({ routes });
```

En `src/entry-server.tsx`, importa las rutas del módulo servidor (con loaders y getStaticPaths):

```tsx
export { routes } from "virtual:pages/server";
```

## Qué hace

- Intercepta clicks en links internos.
- Resuelve la ruta desde el manifest `virtual:pages`.
- Obtiene datos del loader via `/__data?path=...` (los loaders son server-only, nunca se ejecutan en el browser).
- Renderiza/hidrata la página sin recarga completa.
- Soporta prefetch en hover/focus/touch (activado por defecto).

## API principal

```ts
startRouter(options): Promise<RouterInstance>
```

`options` relevantes:

- `routes`: rutas generadas por `virtual:pages` (obligatorio).
- `rootElementId`: id del contenedor raíz (`root` por defecto).
- `base`: prefijo de ruta (e.g. `"/grupos"`). Se lee automáticamente de `virtual:pages`. Usado para strip antes de resolver rutas.
- `baseUrl`: base para `navigate()` (por defecto `window.location.origin`).
- `prefetch`: habilita/deshabilita prefetch automático (`true` por defecto).

`RouterInstance`:

- `navigate(to, options?)`: navegación programática.
- `revalidar()`: vuelve a ejecutar los loaders de la ruta activa.
- `dispose()`: limpia listeners del router.

## Navegación programática

```ts
const router = await startRouter({ routes });
await router.navigate("/blog/hola");
await router.navigate("/perfil", { replace: true, scroll: false });
```

`NavigateOptions`:

- `replace`: usa `history.replaceState` en vez de `pushState`.
- `scroll`: controla scroll automático tras navegar (`true` por defecto).

## Revalidar

Vuelve a ejecutar los loaders de la ruta activa, incluidos los de sus layouts, y actualiza lo que devuelve `useLoaderData()`. Sirve para refrescar la pantalla después de una escritura sin recargarla entera:

```ts
const { revalidar } = await startRouter({ routes });

await fetch("/api/configuracion", { method: "PUT", body });
await revalidar();
```

La promesa resuelve cuando la pantalla ya tiene los datos nuevos, así que sirve para pintar un estado de pendiente. Si un loader falla, la promesa rechaza y los datos anteriores se quedan en pantalla.

No toca la URL ni el historial y no hace scroll. El smart refetch de layouts (`stableLayouts`) no aplica: los loaders de los layouts se re-ejecutan también.

## Opt-out por enlace

Si un enlace no debe ser interceptado por el router, usa:

```html
<a href="/externo" data-suamox-router="false">Abrir normal</a>
```

También se ignoran enlaces con:

- `target` distinto de `_self`
- `rel="external"`
- `download`
- `mailto:` y `tel:`

## 404 en cliente

Si existe la ruta `/404`, el router la usa cuando no encuentra coincidencia de ruta.
