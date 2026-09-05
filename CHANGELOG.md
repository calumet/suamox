# Changelog

## 0.9.0 (2026-09-05)

### Features

- **`ssr-runtime`: `useLoaderData()`, `useRouteLoaderData()` y `PageProps` toman el tipo del loader.** El generico tomaba el tipo de los datos, asi que cada pagina derivaba la conversion a mano (`type Datos = Awaited<ReturnType<typeof loader>>`) o repetia la forma, que es peor: el tipo escrito a mano compila igual cuando el loader pasa a devolver otra cosa, y nadie se entera hasta que la pagina lee `undefined`. Ahora se pasa la funcion, como en Remix y React Router:

  ```tsx
  export async function loader({ params }: LoaderContext) {
    return { producto: await fetchProducto(params.id) };
  }

  export default function ProductoPage({ data }: PageProps<typeof loader>) {
    const { producto } = useLoaderData<typeof loader>();
  }
  ```

  No rompe nada y no hace falta ni una mayor ni un nombre nuevo conviviendo. `LoaderData<L>` solo infiere cuando `L` es una funcion y devuelve el tipo tal cual cuando no lo es, asi que las llamadas que pasan el tipo de los datos (`useLoaderData<{ categories: string[] }>()`) siguen dando exactamente lo mismo. Es la forma del `SerializeFrom` de React Router. Para leer el loader de otro nivel, `import type { loader as layoutLoader } from "../layout"` no deja rastro en el bundle.

- **Los datos del loader viajan con devalue: un `Date` llega siendo un `Date`.** El transporte era `JSON.stringify`, asi que el tipo inferido tenia que mentir o degradarse: una fecha salia `Date` del loader y llegaba `string` al componente, y el mismo componente se comportaba distinto en el servidor y al hidratar. Ahora `window.__INITIAL_DATA__` y `/__data` usan [devalue](https://github.com/Rich-Harris/devalue), asi que lo que devuelve el loader es lo que llega:

  ```tsx
  export async function loader() {
    return { publicado: new Date(), vistas: new Set([1, 2]) };
  }

  export default function Nota() {
    const { publicado } = useLoaderData<typeof loader>();
    return <time>{publicado.toLocaleDateString("es")}</time>;
  }
  ```

  Sobreviven `Date`, `Map`, `Set`, `RegExp`, `URL`, `BigInt`, typed arrays, `undefined`, `NaN`, `-0`, los arrays con huecos y las referencias ciclicas o compartidas: dos campos que apuntaban al mismo objeto lo siguen haciendo despues de hidratar. Con eso `LoaderData<L>` es `Awaited<ReturnType<L>>` a secas y no hace falta ningun tipo de conversion.

  Es lo que hacen SvelteKit y Nuxt, que usan devalue tambien; React Router llego a lo mismo por otra via (turbo-stream) al dejar atras su `SerializeFrom`. devalue pesa unos 2 kB en el cliente, no tiene dependencias, y su `parse` no usa `eval`, asi que no pide aflojar la CSP.

  De regalo, devalue rechaza las claves `__proto__`. Antes `window.__INITIAL_DATA__` se emitia como literal de objeto, donde `__proto__:` fija el prototipo: un loader que devolviera JSON externo sin filtrar dejaba al atacante controlar propiedades heredadas del `data` que llega al componente.

### Breaking Changes

- **El formato de `window.__INITIAL_DATA__` y de `/__data` ya no es JSON plano.** Es el formato aplanado de devalue, que se lee con `deserializeData()`:

  ```js
  window.__INITIAL_DATA__ = [{ time: 1, secret: 2 }, "2026-09-05T05:27:01.359Z", "server-only"];
  ```

  Afecta a quien lea `window.__INITIAL_DATA__` a mano o llame a `/__data` desde fuera del router; un test que hiciera `expect(await response.json()).toEqual({ ... })` ahora tiene que envolverlo en `deserializeData()`. `serializeData()` sigue exportado y cambia de formato en consecuencia, y se le suma `deserializeData()`.

  Los tres paquetes comparten el formato, asi que **`@calumet/suamox`, `@calumet/suamox-router` y `@calumet/suamox-hono-adapter` tienen que actualizarse juntos.**

- **Las instancias de clase en el retorno de un loader pasan a dar error.** `JSON.stringify` las convertia en silencio llamando a su `toJSON()`, con lo que un `Decimal` de Prisma llegaba al componente como `string` aunque el tipo dijera `Decimal`. devalue no sabe reconstruir esa clase en el navegador y prefiere fallar a mandar otra cosa:

  ```txt
  DevalueError: Cannot stringify arbitrary non-POJOs
    at .producto.precio
  ```

  **Migracion.** Convertir en el loader, que es lo que Next.js lleva anos recomendando para su frontera equivalente: `return { ...producto, precio: producto.precio.toString() }`. Las funciones y los simbolos tampoco viajan, por lo mismo.

  Los datos binarios (`Buffer`, `TypedArray`, `ArrayBuffer`) tambien se rechazan, y no por gusto: devalue serializa el `ArrayBuffer` de respaldo entero, no solo la vista, y en Node el pool de `Buffer` se comparte entre peticiones. Un `Buffer.from("v1")` de dos bytes servia 64 KB de memoria del proceso al visitante, con trozos de otras peticiones dentro. Lo encontro una revision de seguridad de esta misma rama; el PoC servia 87.440 bytes por un valor de 2 bytes. Convierte a base64 en el loader o sirve el binario desde su propia ruta.

  SvelteKit y Nuxt resuelven este caso con un hook para registrar tipos propios (`transport`, `definePayloadReducer`). Aqui no existe todavia; SvelteKit tardo dos anos en dar con la forma de esa API y merece su propio diseno.

  `useStaticProps()` no cambia: sus props son server-only, no se serializan y siguen llegando vivas.

### Correcciones

- **`vite-plugin-pages`: el stripping ya no deja en el cliente los imports que solo usa el loader.** El proxy del cliente sustituia la pagina por `export { default } from "<la pagina>"`, asi que Rollup volvia a entrar al archivo original y evaluaba sus imports de arriba: los que solo usaba el loader se caian unicamente si el modulo importado era libre de efectos. Uno con codigo de nivel de modulo —registrar una clave de cache, leer el entorno— viajaba entero al bundle del cliente, justo lo contrario de lo que promete la entrada de 0.2.6.

  Medido en una app real, con un layout y cuatro paginas que leen del backend en sus loaders: 846.885 B de JS de cliente con el cuerpo del loader escrito en la propia pagina, contra 821.162 B sacandolo a un modulo aparte traido con `await import()`. Esos 22 KB de diferencia eran dos modulos de servidor que el navegador descargaba sin usar, y el `import()` si desaparecia porque se iba con el loader. El efecto practico era que la app tenia que hacer justo lo que el stripping venia a ahorrar.

  Ahora el modulo se reescribe en su sitio, como en el plugin de Vite de React Router: se borran las declaraciones de los exports de servidor y despues se podan los imports y las declaraciones de nivel superior que quedaron sin usar, asi que el import se va aunque el modulo importado tenga efectos. Se conservan los imports sin bindings (`import "./estilos.css"`), las declaraciones cuyo inicializador tiene efectos y cualquier helper que el componente siga usando.

### Packages

| Paquete                             | Version anterior | Nueva version |
| ----------------------------------- | ---------------- | ------------- |
| `@calumet/suamox`                   | 0.2.12           | 0.3.0         |
| `@calumet/suamox-router`            | 0.4.1            | 0.5.0         |
| `@calumet/suamox-hono-adapter`      | 0.4.2            | 0.5.0         |
| `@calumet/suamox-vite-plugin-pages` | 0.5.0            | 0.6.0         |

## 0.8.0 (2026-09-01)

### Features

- **`vite-plugin-pages`: `export const layout = false` saca a una pagina de su cadena de layouts.** Los layouts se recogen subiendo por la cadena de carpetas hasta `pages/`, y un grupo no corta ese ascenso, asi que una pantalla no podia salirse del layout de su carpeta: la unica salida era sacarla de la carpeta y duplicar el segmento padre.

  ```tsx
  // src/pages/[[lang]]/ingresar.tsx
  export const layout = false;
  ```

  Es por pagina, asi que sus hermanas de la misma carpeta conservan el layout. Los loaders de los layouts que se salta tampoco se ejecutan: la decision se toma al escanear, no al renderizar, asi que el modulo de rutas no los declara y ni el endpoint `/__data` ni el SSR los llaman.

  El valor tiene que ser el literal `false`. A diferencia de `prerender` y `csr`, que se leen en tiempo de ejecucion, la cadena de layouts se resuelve al generar el modulo de rutas, asi que el valor se lee del AST de Oxc en el mismo parseo que ya detectaba los exports. Un `layout = false` dentro de un comentario o de un string no cuenta, y `layout = true` no desactiva nada.

### Packages

| Paquete                             | Version anterior | Nueva version |
| ----------------------------------- | ---------------- | ------------- |
| `@calumet/suamox-vite-plugin-pages` | 0.4.0            | 0.5.0         |

## 0.7.0 (2026-09-01)

### Features

- **`vite-plugin-pages`: segmento opcional `[[param]]`.** Un archivo compila a dos rutas, una sin el parametro y otra con el, asi que un idioma por defecto sin prefijo deja de necesitar un espejo por pantalla:

  ```txt
  src/pages/[[lang]]/ingresar.tsx  ->  /ingresar  y  /:lang/ingresar
  src/pages/[[lang]]/index.tsx     ->  /          y  /:lang
  ```

  Las dos rutas comparten archivo, layouts y loader. En la ruta sin prefijo el parametro llega indefinido, no como cadena vacia, asi que `params.lang ?? "es"` es la forma natural de leerlo. La sintaxis es la de SvelteKit: los parentesis ya estan tomados por los grupos de rutas.

  Antes `[[lang]]` no daba error, caia por la rama de `[param]` y producia un parametro llamado literalmente `[lang]`: `[[lang]]/ingresar.tsx` compilaba a `/:[lang]/ingresar`.

  Dos restricciones, las dos con error de compilacion:

  - Un solo opcional por ruta.
  - Lo que sigue al opcional tiene que ser estatico. `[[lang]]/[producto].tsx` generaria `/:producto` y `/:lang/:producto`, que casan las mismas URLs sin forma de saber si `/bandera` es el producto o el idioma. Es la ambiguedad que arrastra Remix con `($lang)`, y resolverla pide restringir los valores del parametro, que es otra pieza. `[[...resto]]` tampoco existe: un catch-all ya casa cero segmentos.

  No cambia el matcher ni la prioridad: las dos rutas del mismo archivo tienen distinto numero de segmentos y nunca compiten, y frente a otras rutas la regla de siempre ya hace lo correcto, `/ingresar` (estatico) le gana a `/:lang` (dinamico) a igual profundidad.

### Packages

| Paquete                             | Version anterior | Nueva version |
| ----------------------------------- | ---------------- | ------------- |
| `@calumet/suamox-vite-plugin-pages` | 0.3.0            | 0.4.0         |

## 0.6.1 (2026-08-31)

### Correcciones

- **`router`: una revalidacion pedida antes de la hidratacion se descartaba.** `revalidar()` resolvia como no-op si todavia no habia router registrado, que es la ventana entre que arranca `startRouter()` y termina el render inicial. Una escritura que caia ahi se guardaba pero la pantalla se quedaba con el dato viejo, sin error y sin señal. Ahora la peticion queda pendiente y corre en cuanto el router se registra. Un handler de React no puede caer en esa ventana (la hidratacion ocurre dentro del render que `startRouter()` espera), pero si lo que no depende de React: `visibilitychange`, un mensaje de websocket, codigo a nivel de modulo. En esa ventana la promesa resuelve antes que la revalidacion; encadenarla a una promesa de "router listo" colgaria para siempre si `startRouter()` nunca resuelve.

- **`RedirectResponse`: la marca tambien comprueba la forma.** Definir `Symbol.hasInstance` hizo que `instanceof` dejara de mirar la cadena de prototipos, asi que pasaba a ser cierto para cualquier objeto con la marca, literales incluidos: la clase validaba pertenencia, no forma. Un objeto marcado sin `location` producia el sobre igual, y peor de lo que parece, porque `c.json({ __redirect: undefined })` serializa a `{}`: el cliente no ve la clave, cae por la rama de datos planos y renderiza con `{}` sin redirigir ni fallar. Ahora la marca exige ademas que `location` sea un string, con lo que un objeto marcado y malformado es un error 500 normal en vez de un redirect fantasma.

### Packages

| Paquete                  | Version anterior | Nueva version |
| ------------------------ | ---------------- | ------------- |
| `@calumet/suamox`        | 0.2.11           | 0.2.12        |
| `@calumet/suamox-router` | 0.4.0            | 0.4.1         |

## 0.6.0 (2026-08-31)

### Features

- **`router`: `revalidar()` tambien se exporta del paquete.** Antes solo salia de la instancia que devuelve `startRouter()`, asi que llamarlo desde un componente obligaba a guardar esa instancia en un modulo aparte: cinco lineas de pegamento que toda app tenia que repetir. Ahora se importa directo y apunta al router activo:

  ```tsx
  import { revalidar } from "@calumet/suamox-router";

  await fetch("/api/portal/configuracion", { method: "PUT", body });
  await revalidar();
  ```

  Es la misma funcion que expone la instancia; `router.revalidar()` sigue existiendo. Sin router activo (SSR, o antes de que `startRouter()` resuelva) es un no-op que resuelve. `dispose()` suelta la referencia.

### Packages

| Paquete                  | Version anterior | Nueva version |
| ------------------------ | ---------------- | ------------- |
| `@calumet/suamox-router` | 0.3.1            | 0.4.0         |

## 0.5.1 (2026-08-31)

### Correcciones

- **`hono-adapter`: el endpoint `/__data` convertia cualquier redirect en un 500.** El `catch` comparaba el error contra la copia de `RedirectResponse` que importa el adaptador, pero el codigo de la aplicacion lanza la de su propia copia del modulo (en dev la resuelve el runner de Vite, en prod el bundle del servidor). Eran dos clases distintas y el `instanceof` daba falso, asi que una redireccion desde un loader o desde el middleware llegaba al router del cliente como `{"error":"Loader error"}` con 500: la primera carga redirigia y la navegacion siguiente no. `RedirectResponse` ahora se marca con `Symbol.for("suamox.RedirectResponse")` y resuelve `instanceof` por esa marca, asi que cualquier copia del modulo se reconoce. Se elimina el `RedirectResponse: mod.RedirectResponse ?? RedirectResponse` del entry del servidor, que existia por este mismo motivo y nadie leia.

- **`hono-adapter`: un `redirect()` lanzado desde el middleware daba 500.** Solo el endpoint `/__data` traducia la redireccion; los caminos de SSR y de las rutas de API la trataban como error. Los cuatro handlers (dev y prod) la traducen ahora: 302 en SSR y en API, sobre `{ __redirect }` en `/__data`.

- **`MiddlewareContext` recibe `pathname`.** En las peticiones a `/__data` la URL es `/__data` y la ruta pedida viaja en el parametro `path`, asi que un guardia escrito como `context.url.pathname.startsWith("/admin")` -- el ejemplo de la guia -- no se disparaba en ninguna navegacion del cliente y dejaba pasar la autorizacion. `context.pathname` trae la ruta de la pagina ya resuelta, sin `base`, y vale lo mismo en SSR, en `/__data` y en las rutas de API. `docs/guias/middleware.md` se actualizo para usarla y para explicar que se corta con `redirect()`, no devolviendo una `Response` 302 a mano (el `fetch` del router la sigue y recibe HTML).

- **`router`: un redirect interno ya no recarga la pagina entera.** Al recibir el sobre `{ __redirect }` el router hacia siempre `window.location.assign()`. Ahora, si el destino es una ruta del cliente (mismo origen, no SSG, no API), navega a ella sin recargar y reemplaza la entrada del historial, asi que el boton de atras no vuelve a la URL que redirige. Para cualquier otro destino sigue haciendo la carga completa, que es lo correcto. Las cadenas de redirects estan acotadas a 5.

Los dos paquetes del servidor se actualizan juntos: el adaptador pasa `pathname` y el runtime lo declara.

### Packages

| Paquete                        | Version anterior | Nueva version |
| ------------------------------ | ---------------- | ------------- |
| `@calumet/suamox`              | 0.2.10           | 0.2.11        |
| `@calumet/suamox-hono-adapter` | 0.4.1            | 0.4.2         |
| `@calumet/suamox-router`       | 0.3.0            | 0.3.1         |

## 0.5.0 (2026-08-31)

### Features

- **`router`: `revalidar()`.** El router expone `revalidar()` junto a `navigate()` y `dispose()`. Vuelve a ejecutar los loaders de la ruta activa, incluidos los de sus layouts, y actualiza lo que devuelve `useLoaderData()`. Antes, despues de una escritura la pantalla se quedaba con lo que trajo el loader y la unica salida era recargar entera.

  ```ts
  const { revalidar } = await startRouter({ routes });

  await fetch("/api/portal/configuracion", { method: "PUT", body });
  await revalidar();
  ```

  La promesa resuelve cuando la pantalla ya tiene los datos nuevos, asi que sirve para pintar un estado de pendiente. Si un loader falla, la promesa rechaza y los datos anteriores se quedan en pantalla. No toca la URL ni el historial y no hace scroll. El smart refetch de layouts (`stableLayouts`) no aplica: los loaders de los layouts se re-ejecutan tambien.

### Packages

| Paquete                  | Version anterior | Nueva version |
| ------------------------ | ---------------- | ------------- |
| `@calumet/suamox-router` | 0.2.8            | 0.3.0         |

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
