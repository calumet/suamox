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

Durante el build de produccion, Suamox genera dos bundles: uno para el servidor y otro para el cliente. Para evitar que codigo server-only (loaders, getStaticPaths, dependencias de base de datos, API keys) termine en el bundle del cliente, el plugin aplica tres mecanismos:

### Stripping de exports de servidor

Los archivos dentro de `src/pages/` que exportan `loader` o `getStaticPaths` se reescriben para el build del cliente: se borra la declaracion de esos exports y despues se podan los imports y las declaraciones de nivel superior que quedaron sin usar. El import desaparece del codigo, asi que el modulo importado no entra al bundle ni siquiera cuando tiene codigo de nivel de modulo que el tree shaking no puede podar.

```ts
// Archivo original: src/pages/blog/[slug].tsx
import { db } from "../../lib/db";

export async function loader({ params }) {
  const post = await db.post.findUnique({ where: { slug: params.slug } });
  return { post };
}

export default function BlogPost() {
  const { post } = useLoaderData();
  return <h1>{post.title}</h1>;
}

// Lo que ve el bundle del cliente: solo el componente.
// El loader y el import de ../../lib/db ya no estan en el modulo.
```

Se conservan los imports sin bindings (`import "./estilos.css"`, escritos por su efecto), las declaraciones cuyo inicializador tiene efectos, y cualquier helper o import que el componente siga usando aunque el loader tambien lo usara.

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
  // getUser nunca llega al cliente: el stripping borra el import y .server.ts lo bloquea
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

### Validacion del bundle generado

Los dos mecanismos anteriores actuan mientras se resuelve el import. Al terminar el build del cliente, el plugin revisa ademas el bundle que realmente salio: recorre los modulos que quedaron en cada chunk y falla si encuentra un `*.server.*`, una ruta de `src/api/`, o un builtin de Node.

Es una red de seguridad, no la primera linea de defensa: cubre lo que evade a las otras dos (un alias, otro plugin que resuelve antes, un import dinamico). Mira los modulos que el bundler incluyo, no el texto del bundle, asi que no depende de que un nombre sobreviva al minificador.

El caso mas comun que atrapa es usar una API de servidor en el componente en vez de en el loader:

```tsx
// src/pages/informe.tsx
import { readFileSync } from "node:fs";

export default function Informe() {
  return <pre>{readFileSync("/etc/hostname", "utf-8")}</pre>; // en el componente
}
```

```
[suamox:pages] Server-only code reached the client bundle:

  assets/informe-Dcku00bO.js
    - __vite-browser-external (Node builtin, unavailable in the browser)

The chunk name points to the page that pulled it in. To fix this, you can:
  1. Use the import inside loader()/getStaticPaths(), never in the component
  2. Move it to a *.server.ts file, which is excluded from the client bundle
  3. Check for an alias or plugin resolving the import before suamox:pages sees it
```

Vite no deja `node:fs` tal cual en el bundle del navegador: lo sustituye por un stub vacio, `__vite-browser-external`. Por eso ese stub es la huella que delata al builtin, y no el nombre del modulo.

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
