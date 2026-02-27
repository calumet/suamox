# Router

Suamox usa `@calumet/suamox-router` como router del cliente para navegación SPA con hidratación SSR.

## Arranque

En `src/entry-client.tsx`:

```tsx
import { startRouter } from '@calumet/suamox-router';
import { routes } from 'virtual:pages';

void startRouter({ routes });
```

## Qué hace

- Intercepta clicks en links internos.
- Resuelve la ruta desde el manifest `virtual:pages`.
- Ejecuta `loader()` de la ruta cuando aplica.
- Renderiza/hidrata la página sin recarga completa.
- Soporta prefetch en hover/focus/touch (activado por defecto).

## API principal

```ts
startRouter(options): Promise<RouterInstance>
```

`options` relevantes:

- `routes`: rutas generadas por `virtual:pages` (obligatorio).
- `rootElementId`: id del contenedor raíz (`root` por defecto).
- `baseUrl`: base para `navigate()` (por defecto `window.location.origin`).
- `prefetch`: habilita/deshabilita prefetch automático (`true` por defecto).

`RouterInstance`:

- `navigate(to, options?)`: navegación programática.
- `dispose()`: limpia listeners del router.

## Navegación programática

```ts
const router = await startRouter({ routes });
await router.navigate('/blog/hola');
await router.navigate('/perfil', { replace: true, scroll: false });
```

`NavigateOptions`:

- `replace`: usa `history.replaceState` en vez de `pushState`.
- `scroll`: controla scroll automático tras navegar (`true` por defecto).

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
