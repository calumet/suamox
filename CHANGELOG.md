# Changelog

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
