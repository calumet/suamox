# Router

Suamox usa `@calumet/suamox-router` como router del cliente para navegación SPA con hidratación SSR.

## Arranque

No hay que escribir nada: las entradas de cliente y de servidor las genera el plugin, y arrancan el router solas.

Si necesitas correr algo **antes** de que el router arranque —analítica, un polyfill, leer una bandera— crea `src/client.ts`. Es opcional y el framework lo importa primero si existe:

```ts
// src/client.ts
if (localStorage.getItem("tema") === "oscuro") {
  document.documentElement.classList.add("oscuro");
}
```

## Qué hace

- Intercepta clicks en links a rutas de la aplicación.
- Resuelve la ruta desde el manifest `virtual:pages`.
- Obtiene datos del loader via `/__data?path=...` (los loaders son server-only, nunca se ejecutan en el browser).
- Sigue las redirecciones del servidor: si el destino es una ruta del cliente navega sin recargar y reemplaza la entrada del historial; si no (ruta SSG, API u otro origen), hace una carga completa.
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
- `revalidate()`: vuelve a ejecutar los loaders de la ruta activa (igual que el `revalidate()` del paquete).
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

Un destino de otro origen se abre con una carga completa. `navigate()` rechaza los protocolos que ejecutan código o lo incrustan (`javascript:`, `data:`, `blob:` y compañía), igual que las redirecciones de un loader, para que un destino que viene del usuario no se convierta en un XSS. Si el destino viene de un `?returnTo=` o de un formulario y tiene que quedarse en la aplicación, valídalo también con `isSameOriginRedirect()` de `@calumet/suamox`.

## Revalidar

Vuelve a ejecutar los loaders de la ruta activa, incluidos los de sus layouts, y actualiza lo que devuelve `useLoaderData()`. Sirve para refrescar la pantalla después de una escritura sin recargarla entera:

```tsx
import { revalidate } from "@calumet/suamox-router";

async function guardar(body: FormData) {
  await fetch("/api/configuracion", { method: "PUT", body });
  await revalidate();
}
```

`revalidate()` del paquete apunta al router activo, así que puedes llamarlo desde cualquier componente sin guardar la instancia de `startRouter()`. La instancia también lo expone (`router.revalidate()`); es la misma función. Si lo llamas antes de que el router se registre, la revalidación queda pendiente y corre en cuanto hay router.

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

## Rutas que no son de la aplicación

El router solo intercepta los enlaces que casan con una ruta de la aplicación. A uno sin ruta propia lo deja pasar y el navegador se lo pide al servidor. Así, una URL del mismo origen que sirve otro backend detrás del proxy (por ejemplo, un sistema heredado) llega a ese backend. Si nadie la sirve, el servidor pinta `/404` con status `404`.

Con un catch-all en la raíz (`src/pages/[...all].tsx`) todas las URLs casan. Los enlaces a otro backend necesitan entonces el opt-out por enlace.

## Si fallan los datos

Si `/__data` falla durante una navegación (por ejemplo, porque un loader lanza o la red se cae), el router recarga la página y el servidor pinta esa URL. La dirección ya cambió, así que la pantalla no puede quedarse en la página anterior. `revalidate()` no recarga: rechaza y deja los datos anteriores.
