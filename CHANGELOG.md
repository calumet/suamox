# Changelog

## 0.4.1 (2026-08-06)

### Correcciones

- **`hono-adapter`: la ruta raiz se servia sin SSR.** El middleware que sirve los archivos de `public/` desde `dist/client` resolvia las rutas de directorio contra su indice, y Vite emite su `index.html` en ese mismo directorio. Una peticion a `/` daba con ese archivo y respondia antes de llegar al renderizador, asi que la raiz se entregaba como un cascaron vacio: sin SSR y, en rutas con `prerender`, sin su HTML prerenderizado. Las demas rutas nunca lo notaron porque no resuelven a ningun archivo y caen al renderizador. Ahora el middleware ignora las rutas de directorio.

## 0.4.0 (2026-07-20)

Actualizacion mayor del toolchain. Sin cambios en la API publica del framework.

### Dependencias

- **Vite 6 -> 8** (Rolldown/Oxc), **Vitest 2 -> 4**, **@vitejs/plugin-react 4 -> 6** (requiere Vite 8), **@hono/node-server 1 -> 2** (requiere Node >= 20).
- React 19.2, Hono 4.12, TypeScript 5.9.3 (unificado), tsup 8.5, Playwright 1.61, Prettier 3.9.

### Migracion a la Environment API

Se dejaron de usar las APIs de Vite que la Environment API reemplaza:

| Antes                        | Ahora                                         |
| ---------------------------- | --------------------------------------------- |
| `vite.ssrLoadModule(url)`    | `vite.environments.ssr.runner.import(url)`    |
| `vite.ssrFixStacktrace(err)` | (se elimina: el runner corrige los traces)    |
| `server.moduleGraph.*`       | `environment.moduleGraph.*` por entorno       |
| `vite.transformRequest(url)` | `vite.environments.client.transformRequest()` |
| `server.ws.send(...)`        | `server.environments.client.hot.send(...)`    |

El entorno SSR se detecta por duck typing; si no expone `runner` (p. ej. un runtime tipo Cloudflare Workers) se lanza un error explicito. Compatible con Vite 6, 7 y 8.

### Optimizaciones

- **Deteccion de exports con el parser Oxc (`parseSync`) en vez de es-module-lexer.** Corrige un bug: es-module-lexer no parsea `.tsx`, asi que la deteccion de `loader`/`getStaticPaths`/`prerender` caia a un regex con falsos positivos (reconocia `loader` en comentarios o strings). Se elimina `es-module-lexer` de las dependencias.
- **Guard client/server por entorno** via `this.environment.config.consumer` en vez de un `build.ssr` global.
- **CSS por pagina en dev**: se recorre el grafo del entorno SSR de la pagina renderizada e inyecta su CSS, no solo el global de `entry-client.tsx` (evita flash sin estilos). Solo dev.

### Compatibilidad

- **`peerDependencies` de vite ampliadas** en `suamox-vite-plugin-pages` y `suamox-hono-adapter`: `^6.0.0 || ^7.0.0 || ^8.0.0`.
- Los proyectos nuevos de `create-app` requieren **Node `^20.19.0 || >=22.12.0`** (el template usa Vite 8). Los proyectos existentes no se ven afectados hasta que suban Vite.

### Sin actualizar (deliberado)

- **TypeScript 7.0** (port a Go): rompe `tsup --dts` y `typescript-eslint` no lo soporta. Se mantiene 5.9.3 hasta TS 7.1.
- **ESLint 10**: `@calumet/elise-linter` arrastra `eslint-plugin-react@7.37.5`, incompatible con ESLint 10. Se mantiene ESLint 9.

### Bug Fixes

- `eslint.config.js` ahora ignora `coverage/` y `test-results/` (antes `pnpm lint` fallaba tras `pnpm test:coverage`).
- Eliminadas dos aserciones de tipo que `@types/node` volvio redundantes.

### Packages

| Paquete                             | Version anterior | Nueva version |
| ----------------------------------- | ---------------- | ------------- |
| `@calumet/suamox`                   | 0.2.9            | 0.2.10        |
| `@calumet/suamox-cli`               | 0.1.2            | 0.1.3         |
| `@calumet/suamox-create-app`        | 0.2.5            | 0.3.0         |
| `@calumet/suamox-head`              | 0.1.0            | 0.1.1         |
| `@calumet/suamox-hono-adapter`      | 0.3.0            | 0.4.0         |
| `@calumet/suamox-router`            | 0.2.7            | 0.2.8         |
| `@calumet/suamox-vite-plugin-pages` | 0.2.10           | 0.3.0         |

---

## 0.3.0 (2026-04-16)

### Breaking Changes

- **Middleware `next()` ahora ejecuta el pipeline real.** Antes `next()` devolvia `Response(null)` (un stub vacio) y el adapter ignoraba el return del middleware cuando `next()` era llamado. Ahora `next()` ejecuta loaders + `renderToString` + `generateHTML` y devuelve el `Response` con el HTML renderizado. El middleware puede leer, modificar o reemplazar ese response.
  - **Impacto**: middleware que llamaba `next()` y dependia de que el return fuera ignorado dejara de funcionar como antes. En la practica ningun middleware conocido depende de esto, ya que el return se descartaba silenciosamente.
  - **Migracion**: no se requieren cambios si el middleware ya retornaba `next()` directamente (`return next()`). Si el middleware retornaba algo distinto despues de llamar `next()`, ese valor ahora si se usa como response final.

- **`context.params` ahora contiene los params de la ruta.** Antes era siempre `{}`. El route matching se ejecuta antes del middleware para que `context.params` tenga los valores reales (e.g., `context.params.slug`). Middleware que parseaba params manualmente desde el pathname puede simplificarse.

### Features

- **Response wrapping en middleware**: el middleware puede llamar `next()`, leer el body con `response.clone().text()`, agregar headers, cachear el HTML, o reemplazar el response completo. Esto habilita caching de HTML renderizado a nivel de middleware sin forkear el adapter ni usar un reverse proxy externo.

### Packages

| Paquete                        | Version anterior | Nueva version |
| ------------------------------ | ---------------- | ------------- |
| `@calumet/suamox-hono-adapter` | 0.2.14           | 0.3.0         |

---

## 0.2.6 (2026-03-20)

### Security

- **Server code stripping**: durante el build del cliente, los archivos de pagina y layout dentro de `src/pages/` son reemplazados por un modulo proxy que solo re-exporta `default`, `prerender` y `csr`. Los exports `loader`, `getStaticPaths` y sus dependencias no entran al bundle del cliente. Usa el enfoque de Remix: query string `?__suamox-client-route` en el codegen + `transform` hook que parsea los exports ya transformados por Vite.
- **Convencion `.server.ts`**: archivos nombrados `*.server.{ts,tsx,js,jsx}` son bloqueados del bundle del cliente. Si codigo del cliente intenta importar un `.server.ts`, el build falla con un error explicito.

### Breaking Changes

- **`entry-server.tsx` debe usar `export *`**: el archivo `src/entry-server.tsx` ahora debe usar `export * from "virtual:pages/server"` en vez de named exports individuales. Esto es necesario para que el middleware (`onRequest`) y futuros exports del virtual module se propaguen al prod handler sin modificar el archivo manualmente cada vez. Proyectos existentes deben actualizar su `entry-server.tsx`.

### Bug Fixes

- **Router: click handler no interceptaba en dev**: los event listeners del router se registraban despues de `await renderLocation()` (hidratacion). En dev, la hidratacion es lenta (modulos bajo demanda via Vite) y los clicks ocurrian antes de que el handler existiera, causando full page reload en vez de SPA navigation. Ahora los listeners se registran antes de la hidratacion.
  - **Limitacion conocida**: si el usuario hace click antes de que la hidratacion termine, la navegacion se ejecuta sin que React haya hidratado el DOM. Esto puede causar un hydration mismatch momentaneo. En la practica es poco probable porque la hidratacion en dev toma ~200-500ms.
- **Middleware no se exportaba en prod**: `entry-server.tsx` no re-exportaba `onRequest` de `virtual:pages/server`, asi que el middleware no se cargaba en el prod handler. Cambiado a `export * from "virtual:pages/server"`.
- **Middleware path relativo en codegen**: el codegen usaba una ruta relativa (`../../src/middleware`) que no se resolvia desde virtual modules. Ahora usa la ruta absoluta del archivo detectado por el scanner.

### Packages

| Paquete                             | Nueva version |
| ----------------------------------- | ------------- |
| `@calumet/suamox-vite-plugin-pages` | 0.2.6         |
| `@calumet/suamox-router`            | 0.2.3         |
| `@calumet/suamox-create-app`        | 0.2.2         |

---

## 0.2.3 / 0.2.4 / 0.2.5 (2026-03-19)

### Features

- **Middleware**: soporte para `src/middleware.ts` con la funcion `onRequest(context, next)`. El middleware se ejecuta antes de los loaders en cada peticion, tanto SSR como `/__data`. Permite setear `context.locals` con datos transversales (auth, sesion, i18n) que los loaders reciben via `LoaderContext.locals`. El middleware puede cortar la peticion (short-circuit) retornando una respuesta sin llamar a `next()`. Solo se incluye en el server bundle, nunca en el cliente.
- **`LoaderContext.locals`**: todos los loaders (pagina y layout) ahora reciben `locals` en su contexto. `locals` nunca se serializa ni se envia al cliente.

### Packages

| Paquete                             | Nueva version |
| ----------------------------------- | ------------- |
| `@calumet/suamox`                   | 0.2.3         |
| `@calumet/suamox-vite-plugin-pages` | 0.2.5         |
| `@calumet/suamox-hono-adapter`      | 0.2.4         |

---

## 0.2.2 / 0.2.3 / 0.2.4 (2026-03-18)

### Features

- **Layout loaders**: los archivos `layout.tsx` ahora pueden exportar una funcion `loader()`. Cada layout obtiene su propio `LoaderDataContext.Provider`, por lo que `useLoaderData()` en un layout lee los datos de su propio loader, no del loader de la pagina hija. Esto elimina la necesidad de duplicar datos de layout en cada loader de pagina.
- **Smart refetch (stableLayouts)**: durante navegacion SPA entre paginas hermanas (mismo layout), el router detecta que layouts son estables y envia `stableLayouts` al servidor para evitar re-ejecutar sus loaders. Solo se re-ejecutan los loaders de segmentos que cambiaron, como hace Remix.
- **Route IDs opacos**: los layouts se identifican con IDs derivados de la ruta (`layout:root`, `layout:[lang]`, `layout:(admin)`) en vez de rutas del filesystem. Los file paths nunca se exponen al cliente.
- **`layoutInfos` en codegen**: el modulo virtual genera `layoutInfos` tanto para server (con loader) como para client (sin loader), permitiendo a `createPageElement` anidar providers correctamente.
- **Formato estructurado de datos**: `__INITIAL_DATA__` y `/__data` usan formato `{ page, layouts }` cuando hay layout loaders. Retrocompatible: sin layout loaders el formato es plano.
- **Base path support**: soporte para `vite.config.base`, stripBase en routing, SSG output paths, y navegacion client-side.

### Packages

| Paquete                             | Nueva version |
| ----------------------------------- | ------------- |
| `@calumet/suamox`                   | 0.2.2         |
| `@calumet/suamox-vite-plugin-pages` | 0.2.4         |
| `@calumet/suamox-router`            | 0.2.2         |
| `@calumet/suamox-hono-adapter`      | 0.2.3         |

## 0.2.0 (2026-03-16)

### Breaking Changes

- **Loaders y `getStaticPaths` son ahora server-only.** Ya no se ejecutan en el navegador durante navegación SPA. El código de loaders no se incluye en el bundle del cliente.
- **`virtual:pages/server`** es el nuevo módulo para el servidor. `entry-server.tsx` debe importar de `virtual:pages/server` en vez de `virtual:pages`.

### Features

- **Endpoint `/__data`**: durante navegación SPA, el router del cliente hace fetch a `GET /__data?path=/ruta` en vez de ejecutar el loader en el browser. El servidor ejecuta el loader y devuelve JSON. Esto resuelve problemas de CORS, variables de entorno inaccesibles y filtración de secretos al cliente.
- **Separación de módulos virtuales**: `virtual:pages` (cliente) no incluye `loader` ni `getStaticPaths`. `virtual:pages/server` (servidor) incluye todo.
- **`hasLoader` en RouteRecord**: el módulo cliente incluye un flag `hasLoader` para que el router sepa que debe hacer fetch al servidor.
- **Template `.gitignore`**: `create-suamox` ahora genera un `.gitignore` en proyectos nuevos.

### Packages

| Paquete                             | Versión anterior | Nueva versión |
| ----------------------------------- | ---------------- | ------------- |
| `@calumet/suamox`                   | 0.1.10           | 0.2.0         |
| `@calumet/suamox-vite-plugin-pages` | 0.1.9            | 0.2.0         |
| `@calumet/suamox-router`            | 0.1.6            | 0.2.0         |
| `@calumet/suamox-hono-adapter`      | 0.1.11           | 0.2.0         |
| `@calumet/suamox-create-app`        | 0.1.3            | 0.2.0         |

### Migration

En proyectos existentes, cambiar `entry-server.tsx`:

```diff
- export { routes } from "virtual:pages";
+ export { routes, renderPage, matchRoute, resolveRouteModule, RedirectResponse } from "virtual:pages/server";
```

No se requieren otros cambios. Los loaders siguen funcionando igual desde la perspectiva del desarrollador — la diferencia es que ahora se ejecutan exclusivamente en el servidor.

## 0.2.1 / 0.2.2 (2026-03-16)

### Bug Fixes

- **fix(codegen)**: coma faltante antes de `hasLoader` en el route object generado, causaba parse error en `virtual:pages/server`.
- **fix(hono-adapter)**: contexto React compartido entre adapter y páginas. El dev handler ahora carga `renderPage` via `vite.ssrLoadModule("@calumet/suamox")` para usar la misma instancia de `LoaderDataContext`. El prod handler usa las funciones re-exportadas desde el server entry.
- **fix(codegen)**: el módulo servidor re-exporta `renderPage`, `matchRoute`, `resolveRouteModule` y `RedirectResponse` desde `@calumet/suamox` para que el prod handler comparta la misma instancia con las páginas.

### Features

- **Tests e2e con Playwright**: suite completa que prueba SSR, `/__data`, SPA navigation, back navigation, `useLoaderData`, `useStaticProps`, y blog SSG. Se ejecutan contra dev y prod handlers.

### Packages

| Paquete                             | Nueva versión |
| ----------------------------------- | ------------- |
| `@calumet/suamox-vite-plugin-pages` | 0.2.2         |
| `@calumet/suamox-hono-adapter`      | 0.2.1         |
| `@calumet/suamox-create-app`        | 0.2.1         |
