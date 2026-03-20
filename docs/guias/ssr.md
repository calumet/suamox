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
- `virtual:pages/server` (con loaders y getStaticPaths) se usa en el servidor para SSR y el endpoint `/__data`.
- `virtual:pages` (sin loaders) se carga en el navegador para el router SPA.
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

## Endpoint de datos (`/__data`)

Durante navegación SPA, el router del cliente no ejecuta loaders directamente. En su lugar, hace fetch al endpoint del servidor:

- `GET /__data?path=/ruta&query=valor` -> JSON con los datos del loader

El servidor ejecuta el loader de la ruta correspondiente y devuelve el resultado como JSON. Si el loader usa `redirect()`, la respuesta contiene `{ __redirect, __status }` y el cliente redirige automáticamente.

## Endpoint de salud

Siempre está disponible:

- `GET /health` -> `{ "status": "ok" }`

## HTML y datos iniciales

Para páginas SSR (sin `prerender = true`), el runtime genera HTML completo e inyecta:

- `window.__INITIAL_DATA__` con datos serializados de `loader()`.
- `<link rel="stylesheet">` para CSS resuelto desde manifest.
- Scripts y preloads de cliente para hidratación.

Las páginas con `prerender = true` (SSG) no incluyen scripts de hidratación ni `__INITIAL_DATA__`. Solo se sirve el HTML estático con sus estilos CSS.

## Separacion de codigo servidor/cliente

Durante el build de produccion, Suamox genera dos bundles: uno para el servidor y otro para el cliente. Para evitar que codigo server-only (loaders, getStaticPaths, dependencias de base de datos, API keys) termine en el bundle del cliente, el plugin aplica dos mecanismos:

### Proxy automatico de paginas

Los archivos dentro de `src/pages/` que exportan `loader` o `getStaticPaths` son reemplazados automaticamente en el build del cliente por un modulo proxy que solo re-exporta los exports seguros (`default`, `prerender`, `csr`). Esto garantiza que el loader y sus imports no entran al grafo de dependencias del cliente.

```ts
// Archivo original: src/pages/blog/[slug].tsx
export async function loader({ params }) {
  const post = await db.post.findUnique({ where: { slug: params.slug } });
  return { post };
}

export default function BlogPost() {
  const { post } = useLoaderData();
  return <h1>{post.title}</h1>;
}

// Proxy generado automaticamente para el bundle del cliente:
// export { default } from "/src/pages/blog/[slug].tsx";
// loader y db nunca entran al bundle
```

### Convencion `.server.ts`

Los archivos nombrados `*.server.ts` (o `.server.tsx`, `.server.js`, `.server.jsx`) son excluidos del bundle del cliente. Si codigo del cliente intenta importar un archivo `.server.ts`, el build falla con un error explicito.

```
src/
  lib/
    db.server.ts      # solo disponible en el servidor
    auth.server.ts    # solo disponible en el servidor
    utils.ts          # disponible en ambos bundles
  pages/
    index.tsx
```

```ts
// src/pages/index.tsx
import { getUser } from "../lib/auth.server"; // OK en el loader (server-only)

export async function loader() {
  const user = await getUser();
  return { user };
}

export default function Home() {
  // getUser nunca llega al cliente gracias al proxy + .server.ts
  const { user } = useLoaderData();
  return <p>Hola, {user.name}</p>;
}
```

Si por error un componente del cliente importa directamente un `.server.ts`:

```ts
// Esto falla en build con un error claro:
import { getUser } from "../lib/auth.server";
```

```
[suamox:pages] Cannot import server-only file "auth.server.ts" from client code.
Files matching *.server.{ts,tsx,js,jsx} are excluded from the client bundle.
```

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
