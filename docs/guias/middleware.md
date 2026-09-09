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

| Propiedad  | Tipo                      | Descripcion                                            |
| ---------- | ------------------------- | ------------------------------------------------------ |
| `request`  | `Request`                 | La peticion HTTP original                              |
| `url`      | `URL`                     | La URL parseada                                        |
| `pathname` | `string`                  | La ruta que caso, sin `base` y con el reroute aplicado |
| `params`   | `Record<string, string>`  | Parametros de la ruta                                  |
| `locals`   | `Record<string, unknown>` | Objeto mutable para pasar datos a los loaders          |

Para cortar rutas usa `context.pathname`, no `context.url.pathname`: en las peticiones al endpoint `/__data` la URL es `/__data` y la ruta pedida viaja en el parametro `path`, asi que un guardia que lea `url` no se dispara en ninguna navegacion del cliente.

## Middleware por directorio

Un `middleware.ts` dentro de `src/pages/` protege esa carpeta y todo lo que cuelga de ella. Exporta el mismo `onRequest` que el global:

```txt
src/
  middleware.ts                 corre para todo
  pages/
    (privado)/
      middleware.ts             corre solo para lo de esta carpeta
      protegido.tsx             -> /protegido
```

```ts
// src/pages/(privado)/middleware.ts
import { redirect } from "@calumet/suamox";
import type { MiddlewareContext, MiddlewareNext } from "@calumet/suamox";

export async function onRequest(context: MiddlewareContext, next: MiddlewareNext) {
  if (!context.locals.user) {
    redirect("/ingresar");
  }
  return next();
}
```

Es la forma preferida de autorizar. Frente a un guardia por `pathname` en el global:

- **Los grupos de rutas quedan cubiertos.** `/protegido` no tiene nada en su URL que diga que está en `(privado)`, y aun así el guardia se aplica. Con un guardia por `pathname` habría que mantener a mano la lista de rutas del grupo.
- **`layout = false` no lo desactiva.** La cadena va por directorio, no por la de layouts.
- Mover una página de carpeta cambia sus guardias, que es lo que uno espera al mover un archivo.

### Orden

Primero el global de `src/middleware.ts`, después los `middleware.ts` de directorio, de la raíz de `pages/` hacia la carpeta de la página. Todos comparten el mismo `locals`, así que el de una carpeta ve lo que puso el global.

El que no llama a `next()` corta la cadena: ni los de abajo ni los loaders llegan a correr.

### Navegación SPA

El router pide `/__data` cuando la ruta tiene middleware, aunque no tenga loader **y aunque sea `csr`**. Sin eso el guardia solo correría en la carga directa y no al navegar dentro de la aplicación — y un guardia que corre a veces es peor que no tenerlo.

React Router tiene ese mismo agujero y su solución documentada es añadir un `loader` vacío a mano. Aquí no hace falta: el plugin ya sabe en build qué rutas tienen middleware.

### En `src/api/`

Funciona igual: un `middleware.ts` en una carpeta de `src/api/` cubre los endpoints que cuelgan de ella.

### Es server-only

Un `middleware.ts` nunca llega al bundle del navegador, y el plugin corta el build si una página intenta importar algo de él. Guarda ahí lo que quieras: claves, consultas, comprobaciones de sesión.

Si necesitas compartir un helper entre el middleware y una página, ponlo en otro archivo: el que se importa desde el cliente sí viaja al navegador.

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

El middleware se ejecuta tanto para peticiones SSR como para el endpoint `/__data` (navegacion client-side) y para las rutas de API. Esto garantiza que los loaders siempre reciben los mismos `locals` sin importar si la pagina se carga por primera vez o se navega con el router. En los tres casos `context.pathname` es la ruta que caso, con el [reroute](./reroute.md) ya aplicado, para que un guardia y la pagina que se renderiza nunca discrepen.

### Las paginas SSG no pasan por aqui

Una pagina con `prerender = true` se sirve desde `dist/static` sin ejecutar el middleware. No es una limitacion que se pueda levantar: su HTML se genero en el build y es el mismo para todo el mundo, asi que no hay nada que un guardia por peticion pueda cambiar. **Una pagina prerenderizada no se puede proteger con middleware**; si necesita autorizacion, no la prerenderices.

Es lo mismo que hacen React Router, SvelteKit y Astro: en los tres, los loaders y hooks de una ruta prerenderizada corren en el build y no en cada peticion.

Combinar las dos cosas **rompe el build**, en vez de escribir el secreto en disco:

```txt
Route /privado has "prerender = true" and a middleware chain.
A prerendered page is served from disk without running middleware, so it cannot
be protected. Remove the prerender export or move the page out of the guarded
directory.
```

Sin ese corte el fallo solo se veria en produccion: en desarrollo no hay `dist/static`, asi que el guardia si corre y la pagina redirige.

El `onRequest` del adaptador si corre, porque es infraestructura y aplica a toda respuesta.

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

Los dos son solo del servidor. Si lo que quieres es cambiar contra que ruta casa una URL, eso tiene que pasar tambien en el cliente: va en [`src/reroute.ts`](./reroute.md).
