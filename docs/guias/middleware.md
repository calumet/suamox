# Middleware

Suamox soporta un archivo de middleware global que se ejecuta antes de los loaders en cada peticion del servidor. Esto es util para logica transversal como autenticacion, sesion, i18n, o cualquier dato que deba estar disponible en todos los loaders.

## Archivo

El middleware se define en `src/middleware.ts` (o `src/middleware/index.ts`). Debe exportar una funcion `onRequest`:

```ts
// src/middleware.ts
import type { MiddlewareContext, MiddlewareNext } from "@calumet/suamox";

export async function onRequest(
  context: MiddlewareContext,
  next: MiddlewareNext,
): Promise<Response> {
  // logica antes de los loaders
  context.locals.user = await getUser(context.request);
  return next();
}
```

## MiddlewareContext

El objeto `context` contiene:

| Propiedad  | Tipo                      | Descripcion                                   |
| ---------- | ------------------------- | --------------------------------------------- |
| `request`  | `Request`                 | La peticion HTTP original                     |
| `url`      | `URL`                     | La URL parseada                               |
| `pathname` | `string`                  | La ruta de la pagina pedida, sin `base`       |
| `params`   | `Record<string, string>`  | Parametros de la ruta                         |
| `locals`   | `Record<string, unknown>` | Objeto mutable para pasar datos a los loaders |

Para cortar rutas usa `context.pathname`, no `context.url.pathname`: en las peticiones al endpoint `/__data` la URL es `/__data` y la ruta pedida viaja en el parametro `path`, asi que un guardia que lea `url` no se dispara en ninguna navegacion del cliente.

## locals

`locals` es un objeto vacio que el middleware puede popular con datos. Los loaders lo reciben como parte de su contexto:

```ts
// src/middleware.ts
export async function onRequest(context, next) {
  const session = await getSession(context.request);
  context.locals.user = session?.user ?? null;
  context.locals.isAuthenticated = !!session;
  return next();
}
```

```ts
// src/pages/dashboard.tsx
import type { LoaderContext } from "@calumet/suamox";

export async function loader({ locals }: LoaderContext) {
  if (!locals.isAuthenticated) {
    throw redirect("/login");
  }
  const user = locals.user as User;
  return { name: user.name, role: user.role };
}
```

`locals` solo existe en el servidor. Nunca se serializa ni se envia al cliente. Los datos que el cliente necesita deben retornarse explicitamente desde el loader.

## Short-circuit

Si el middleware no llama a `next()`, la peticion se corta y se devuelve la respuesta directamente. Esto permite bloquear rutas sin que los loaders se ejecuten:

```ts
import { redirect } from "@calumet/suamox";

export async function onRequest(context, next) {
  if (context.pathname.startsWith("/admin")) {
    const session = await getSession(context.request);
    if (!session) {
      redirect("/login");
    }
  }
  return next();
}
```

Para redirigir usa `redirect()`. El framework la traduce a un 302 en SSR y al sobre `{ __redirect }` que el router entiende en `/__data`. Una `Response` 302 devuelta a mano solo funciona en SSR: el `fetch` del router la sigue y recibe HTML.

## Flujo de ejecucion

```
Peticion HTTP
  -> Hono middleware (CORS, headers, etc.)
  -> src/middleware.ts (onRequest)
  -> Layout loaders (reciben locals)
  -> Page loader (recibe locals)
  -> Render
```

El middleware se ejecuta tanto para peticiones SSR como para el endpoint `/__data` (navegacion client-side) y para las rutas de API. Esto garantiza que los loaders siempre reciben los mismos `locals` sin importar si la pagina se carga por primera vez o se navega con el router. En los tres casos `context.pathname` es la ruta pedida.

## Diferencia con onRequest del adapter

El adaptador de Hono tiene su propio hook `onRequest` en las opciones del servidor:

```ts
createServer({
  onRequest: (c) => {
    /* acceso al contexto de Hono */
  },
});
```

Este hook es diferente al middleware de `src/middleware.ts`:

|                            | `src/middleware.ts` | Adapter `onRequest` |
| -------------------------- | ------------------- | ------------------- |
| Acceso a `locals`          | Si                  | No                  |
| Puede cortar la peticion   | Si                  | No                  |
| Acceso al contexto de Hono | No                  | Si                  |
| Se incluye en el build     | Server bundle       | Codigo del servidor |

Para logica de aplicacion (auth, sesion, i18n), usa `src/middleware.ts`. Para logica de infraestructura del servidor (logging de Hono, headers personalizados), usa el hook del adapter.
