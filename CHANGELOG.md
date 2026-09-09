# Changelog

## 0.17.0 (2026-09-08)

### Features

- **Middleware por directorio: un `middleware.ts` dentro de `src/pages/` protege esa carpeta y todo lo que cuelga de ella.** Exporta el mismo `onRequest` que el global.

  ```txt
  src/
    middleware.ts                 corre para todo
    pages/
      (privado)/
        middleware.ts             corre solo para lo de esta carpeta
        protegido.tsx             -> /protegido
  ```

  Es la forma preferida de autorizar, y sustituye al guardia por `pathname` en el global. **Los grupos de rutas quedan cubiertos**: `/protegido` no tiene nada en su URL que diga que esta en `(privado)`, y aun asi el guardia se aplica; con un guardia por `pathname` habria que mantener a mano la lista de rutas del grupo. Ese era el argumento de #34.

  La cadena va **por directorio y no por la de layouts** a proposito: una pagina con `layout = false` se salta los layouts, y un guardia no se puede desactivar cambiando la presentacion.

  Orden: primero el global, despues los de directorio de la raiz de `pages/` hacia la carpeta de la pagina. Todos comparten el mismo `locals`. El que no llama a `next()` corta. Funciona igual en `src/api/`.

  **El router pide `/__data` cuando la ruta tiene middleware, aunque no tenga loader.** Sin eso el guardia solo correria en la carga directa y no al navegar dentro de la SPA. React Router tiene ese mismo agujero y su solucion documentada es anadir un `loader` vacio a mano; aca no hace falta porque el plugin ya sabe en build que rutas tienen middleware. Hasta ahora la garantia dependia de que hubiera algun loader en la cadena de la pagina —en el ejemplo lo hay, el de `root.tsx`—, asi que era correcta por accidente.

  El guardia es codigo de servidor y no viaja al bundle del cliente: al navegador solo llega la bandera `hasMiddleware`. Si una pagina importa algo de un `middleware.ts`, el validador de fugas corta el build, porque ese archivo no pasa por el stripping —no es un archivo de ruta— y sus secretos acabarian en el navegador. Solo cuenta dentro de `src/pages/` y `src/api/`: `middleware` es un nombre corriente y un `src/lib/middleware.ts` o uno de `node_modules` es codigo de cliente normal.

  Un `middleware.ts` que no exporte `onRequest` **rompe el build**. El modulo generado ata la cadena con `__mwN.onRequest`, asi que sin ese export quedaba `undefined`, el adaptador lo filtraba y la carpeta se quedaba sin guardia sin que nadie avisara.

  Dos combinaciones que dejarian el guardia sin correr se cierran en vez de documentarse:

  - **`prerender = true` + middleware rompe el build.** El HTML prerenderizado se sirve desde disco sin middleware, asi que la pagina saldria entera; y solo en produccion, porque en desarrollo no hay `dist/static` y el guardia si corre.
  - **`csr = true` + middleware.** La condicion de csr en el router se salta el viaje al servidor, y con el el guardia. Ahora una ruta con middleware lo hace igual, y el endpoint `/__data` no corre los loaders de una ruta csr: ese viaje existe solo para el guardia, y correrlos habria hecho que la pagina renderizara distinto segun se llegue por navegacion o por URL directa.

  Ademas, dos rutas duplicadas **rompen el build** en vez de avisar: cual gana depende del orden, y si una esta en una carpeta protegida y la otra no, eso decide si el guardia corre. En desarrollo se sigue avisando sin cortar.

  Ver [middleware](./docs/guias/middleware.md#middleware-por-directorio). Cierra #34.

## 0.16.0 (2026-09-08)

### Deprecaciones

- **`vite-plugin-pages`: el segmento opcional `[[lang]]` queda deprecado.** Sigue funcionando y ahora avisa al arrancar y en cada build. Se quita en una version proxima.

  Existia para tener un idioma por defecto sin prefijo, y **no sirve para eso en cuanto la app tiene paginas con parametro**: `[[lang]]/[slug].tsx` genera `/:lang` y `/:slug`, que casan las mismas URLs, y nada en el patron permite saber si `/mision-y-vision` es el idioma o el slug. Con [reroute](./docs/guias/reroute.md) el idioma no entra a la tabla de rutas y la ambiguedad no llega a existir, con la mitad de entradas generadas.

  Migracion: saca la pagina de la carpeta opcional y lee el prefijo de `url`, que llega intacta al loader.

  ```diff
  - // src/pages/[[lang]]/ingresar.tsx
  - export function loader({ params }: LoaderContext) {
  -   return { idioma: params.lang ?? "es" };
  - }
  + // src/pages/ingresar.tsx
  + export function loader({ url }: LoaderContext) {
  +   return { idioma: idiomaDe(url) };
  + }
  ```

  El ejemplo ya esta migrado. Cierra #29.

### Correcciones

- **`vite-plugin-pages`: que ruta ganaba dependia de como se llamara el parametro.** `calculatePriority` no miraba `isIndex`, asi que `/:lang` —de `[lang]/index.tsx`— y `/:slug` puntuaban 105 los dos y desempataba el orden alfabetico del path generado. Renombrar `[slug].tsx` a `[articulo].tsx` invertia el resultado: `/en` pasaba de servir la home a servir la pagina del articulo. Mismo codigo, mismo arbol, comportamiento distinto por el nombre de un archivo.

  Un index suma ahora 2 de prioridad, como el `indexRouteValue` de React Router, y le gana a su hermano dinamico por regla. Vale menos que un segmento estatico (10) para que `/ingresar` siga ganandole a `/:lang`.

  Lo que sigue empatado son dos patrones con la **misma forma** —`/blog/:slug` y `/blog/:id`—, que casan exactamente las mismas URLs: ahi cual gane es arbitrario se ordene como se ordene, y el desempate alfabetico se queda para que al menos sea estable entre builds.

  Cierra #28.

## 0.15.0 (2026-09-08)

### Breaking Changes

- **`ssr-runtime`: `isSafeRedirectUrl` pasa a llamarse `hasSafeRedirectProtocol`.** El nombre prometia validar el destino y solo miraba el esquema: `isSafeRedirectUrl("https://evil.com")` devolvia `true`. No era un fallo de la funcion —hace exactamente lo que pedia la CVE de la que salio, [GHSA-2w69-qvjg-hvjx](https://github.com/remix-run/react-router/security/advisories/GHSA-2w69-qvjg-hvjx), que es XSS por protocolo, no open redirect— sino del nombre.

  Migracion: renombra los usos. Si el destino viene del usuario, cambia ademas a `isSameOriginRedirect` (ver abajo).

  ```diff
  - import { isSafeRedirectUrl } from "@calumet/suamox";
  + import { hasSafeRedirectProtocol } from "@calumet/suamox";
  ```

### Features

- **`ssr-runtime`: `isSameOriginRedirect()` para destinos que vengan del usuario.** Comprueba que la URL resuelva dentro del propio origen, que es lo que cierra un open redirect. Cubre las formas que no lo parecen: `//evil.com` y `/\evil.com` resuelven las dos al origen `evil.com`, porque el parser de URL trata `\` como `/`.

  ```ts
  const returnTo = ctx.query.get("returnTo");
  redirect(returnTo && isSameOriginRedirect(returnTo, ctx.url.origin) ? returnTo : "/");
  ```

  El reparto queda: `hasSafeRedirectProtocol` para lo que escribe la app —un `redirect("https://checkout.stripe.com/...")` es legitimo, y es lo que aplica el router a los redirects que llegan por `/__data`—, `isSameOriginRedirect` para lo que llega de fuera. La guia de data loading tenia el ejemplo al reves: recomendaba la validacion por protocolo justo para un `?returnTo=`.

  Cierra #35.

### Correcciones

- **`ssr-runtime`: `matchRoute` re-partia el patron y el pathname por cada ruta candidata.** Con 24 rutas, una URL que no casa hacia hasta 48 `split` y 48 arrays por llamada, y `matchRoute` corre en cada peticion del servidor, en cada navegacion del cliente y en cada hover sobre un enlace.

  El patron de una ruta se compila una vez y se guarda en un `WeakMap` por objeto de ruta; el pathname se parte una sola vez por llamada, no una por candidata.

  | caso                             | antes     | despues  |          |
  | -------------------------------- | --------- | -------- | -------- |
  | estatica pronto en la tabla      | 235 ns    | 228 ns   | -3%      |
  | dinamica al final                | 531 ns    | 391 ns   | -26%     |
  | sin match, recorre toda la tabla | 740 ns    | 379 ns   | **-49%** |
  | pathname de 200 segmentos        | 28.056 ns | 6.106 ns | **-78%** |

  Cierra #32.

## 0.14.1 (2026-09-08)

### Correcciones

- **`hono-adapter`: en SSR de produccion ninguna pagina emitia su CSS ni sus preload.** `toManifestKey` generaba `src/pages/blog/dinamico.tsx`, pero el build del cliente importa paginas y layouts con el query de stripping, asi que el manifest las indexa como `src/pages/blog/dinamico.tsx?__suamox-client-route`. El lookup no resolvia nunca y cada pagina salia con la hoja global y nada mas: FOUC y un round trip extra.

  No se veia porque los unicos tests de CSS por ruta cubren `/blog` y `/blog/hello-world`, que son SSG y resuelven el manifest por otro camino, el de `ssg.ts`, que si tenia la clave bien. Se agrega `/blog/dinamico` al ejemplo —misma carpeta y mismo layout, pero sin `prerender`— y su e2e.

  De paso, `collectManifestAssets` recibe ahora la ruta ya casada en vez de casarla por su cuenta: usaba el `matchRoute` del adaptador, que no es el del bundle del servidor, asi que con un `src/reroute.ts` declarado resolvian distinto y habria calculado los assets de otra pagina. Tambien ahorra un match por peticion.

  Cierra #33.

- **`hono-adapter`: el hook `onRequest` del adaptador no corria para las paginas SSG.** El HTML prerenderizado se servia antes que el hook, asi que el logging y los headers de infraestructura se saltaban toda ruta con `prerender = true`. Ahora se sirve entre `onRequest` y el middleware de la app.

  El middleware de `src/middleware.ts` sigue sin correr para esas paginas, y es deliberado: su HTML se genero en el build y es el mismo para todo el mundo, asi que no hay nada que un guardia por peticion pueda decidir. Es lo que hacen React Router, SvelteKit y Astro. Queda escrito en `docs/guias/middleware.md` y `docs/guias/ssg.md`: **una pagina prerenderizada no se puede proteger con middleware**.

  Cierra #31.

## 0.14.0 (2026-09-08)

### Breaking Changes

- **`ssr-runtime`: `renderPage` se mueve a `@calumet/suamox/server`.** Era la unica pieza del entry principal que importaba `react-dom/server`, y ese import estatico arrastraba la libreria entera al bundle del navegador.

  Migracion: cambia el import. Solo afecta a codigo de servidor —adaptadores y entries SSR—; nada del navegador lo usaba.

  ```diff
  - import { renderPage } from "@calumet/suamox";
  + import { renderPage } from "@calumet/suamox/server";
  ```

  Si declaras los tipos de `virtual:pages/server` a mano, actualiza tambien esa linea:

  ```diff
  - export const renderPage: typeof import("@calumet/suamox").renderPage;
  + export const renderPage: typeof import("@calumet/suamox/server").renderPage;
  ```

### Correcciones

- **`react-dom/server` viajaba entero al navegador: 197 KB que nunca se ejecutaban.** `react-dom` no declara `sideEffects: false`, asi que Rollup no podia sacudirlo, y cualquier chunk que tocara `@calumet/suamox` —el router lo toca siempre— lo arrastraba. Ademas iba con `<link rel="modulepreload">` en el HTML, o sea que se descargaba y parseaba en cada visita.

  Medido sobre `examples/basic`: el JS del cliente pasa de **453.667 a 256.429 bytes**, un 43% menos. El chunk de 197.238 bytes con `renderToStaticMarkup`, `renderToString` y `renderToReadableStream` desaparece, y ya no aparece en la lista de precarga.

  Cierra #30.

## 0.13.0 (2026-09-08)

### Breaking Changes

- **`router`: `revalidar()` pasa a llamarse `revalidate()`.** El API publico esta en ingles (`loader`, `getStaticPaths`, `prerender`, `onRequest`) y esta era la unica excepcion. Afecta a la funcion del paquete y al metodo de `RouterInstance`.

  Migracion: renombra los usos.

  ```diff
  - import { revalidar } from "@calumet/suamox-router";
  - await revalidar();
  + import { revalidate } from "@calumet/suamox-router";
  + await revalidate();

  - await router.revalidar();
  + await router.revalidate();
  ```

### Features

- **`reroute`: traducir la URL a una ruta antes de casar.** Un `src/reroute.ts` que exporte `reroute(pathname)` decide contra que ruta se casa cada URL, sin tocar la barra de direcciones. El caso que lo motiva es el prefijo de idioma: `src/pages/` deja de saber que existen los idiomas, y `/en/mision-y-vision` y `/mision-y-vision` casan los dos `[slug].tsx`.

  ```ts
  // src/reroute.ts
  const IDIOMAS = ["en"];

  export function reroute(pathname: string): string | void {
    const [, primero, ...resto] = pathname.split("/");
    if (IDIOMAS.includes(primero)) {
      return "/" + resto.join("/");
    }
  }
  ```

  El hook se registra en el modulo generado de **cliente y servidor**, al reves que el middleware, que es solo del servidor: si un lado casara una ruta distinta del otro, la hidratacion no coincidiria. Por eso vive en su propio archivo y no en `src/middleware.ts`.

  `context.pathname` del middleware pasa a ser **la ruta que caso**, con el reroute ya aplicado, en SSR, en `/__data` y en las rutas de API. Si siguiera siendo la URL pedida, un guardia por ruta se evaluaria sobre una direccion y se renderizaria otra: con un alias `/mx/*` y un `pathname.startsWith("/protegido")`, `/mx/protegido` servia la pagina protegida. Lo calcula `resolveRoutePathname()`, que el adaptador llama directamente en vez de leerlo del resultado del match: `entry.matchRoute` es un punto de extension del entry-server y no puede ser de donde sale un valor con relevancia de seguridad. La URL original sigue intacta en `context.url`.

  Ese pathname va **decodificado**, asi que se normaliza antes de entregarlo: el parser de URL trata `\` como `/` en esquemas especiales, y sin colapsar las barras iniciales `/%5Cevil.com` llegaba al middleware como `/\evil.com`, que resuelve al origen `evil.com`. Un `redirect(context.pathname)` habria sido un open redirect, y `isSafeRedirectUrl()` lo da por bueno porque solo mira el protocolo. Pasaba con o sin reroute, en cuanto la app tuviera un catch-all.

  Un alias de prefijo **no** alcanza `/api/`, porque el servidor monta esas peticiones por el path crudo; el path de la API sí se reroutea una vez dentro.

  Esto es lo que el segmento opcional `[[lang]]` no puede hacer. `[[lang]]/[slug].tsx` genera `/:lang` y `/:slug`, que casan las mismas URLs, y nada en el patron permite saber si `/mision-y-vision` es el idioma o el slug: es ambiguo, no dificil. Remix documenta la misma ambiguedad y la resuelve casando avidamente mas un redirect en el loader; con reroute el idioma no entra a la tabla de rutas y la ambiguedad no llega a existir.

  Ver [reroute](./docs/guias/reroute.md).

- **`ssr-runtime`: `variants` para prerenderizar las URLs del reroute.** La tabla de rutas no conoce las URLs que solo existen por el reroute, asi que el SSG no las encontraba. `src/reroute.ts` puede exportar el sentido inverso y el prerenderizado escribe esas variantes por cada pathname que ya iba a generar, `getStaticPaths` incluido.

  ```ts
  export function variants(pathname: string): string[] {
    return IDIOMAS.map((idioma) => (pathname === "/" ? `/${idioma}` : `/${idioma}${pathname}`));
  }
  ```

  Si una variante no vuelve a su ruta canonica —`variants` y `reroute` tienen que ser inversas— el SSG la salta y avisa, en vez de escribir un 404 en silencio.

## 0.12.0 (2026-09-06)

### Features

- **`ssr-runtime`: `useClientValue()`, estado del navegador sin el salto de la hidratacion.** Cuando una pantalla depende de `sessionStorage` o de una cookie de JS, el HTML del servidor sale con un valor por defecto y React lo corrige al hidratar: el usuario ve el estado equivocado un instante. El hook devuelve el fallback en SSR y registra un `<script>` inline que corrige el DOM en cuanto el parser lo alcanza; el valor con el que React trabaja sale de ejecutar `resolve` en el cliente.

  ```tsx
  const isLoggedIn = useClientValue(false, () => !!sessionStorage.getItem("idUsr"), {
    show: "#btn-logout",
    hide: "#btn-login",
  });

  <button id="btn-logout" hidden={!isLoggedIn}>Salir</button>
  <a id="btn-login" hidden={isLoggedIn}>Ingresar</a>
  ```

  `show` y `hide` aplican el atributo `hidden` nativo en vez de un `data-*` con CSS del framework. En el JSX se escribe `hidden={!isLoggedIn}` a secas: React omite el atributo cuando vale `false`, mientras que un `data-*` lo emitiria como la cadena `"false"` y un selector `[data-x]` acabaria casandolo igual. Ademas `hidden` es semantico y no obliga a inyectar CSS global. Los elementos parcheados llevan `suppressHydrationWarning`, porque React compara contra el HTML del servidor y no contra el DOM ya corregido.

  **El valor de React no viaja en el script.** El cliente ejecuta `resolve` por su cuenta, con `useSyncExternalStore`, y el script inline solo adelanta la correccion del DOM al primer pintado. Emparejar cliente y servidor por una clave derivada del codigo no funciona: el minificador reescribe el cuerpo de la funcion, asi que el bundle de servidor y el de cliente no producen la misma. Con este reparto un fallo del script cuesta el parpadeo, no el valor.

  El codigo inyectado se escapa antes de emitirlo (`</script` y `<!--`), sobre la cadena ya montada con los selectores dentro, que es la via por la que entrarian datos. Los selectores se serializan, nunca se concatenan. No se escapa `<` entero como en los datos del loader: aqui el contenido es codigo y romperia cualquier comparacion `a < b`. El script va en un `try/catch` para que un fallo suyo no tumbe la pagina.

  El registro de scripts es por peticion, como el de `head`: compartirlo entre peticiones pondria los scripts de un usuario en el HTML de otro.

  Ver [prehydrate](./docs/guias/prehydrate.md).

- **CSP para los scripts inline, en SSR y en SSG.** Un script inline no se ejecuta con una CSP estricta, y hasta ahora no habia forma de autorizarlo. En SSR el adaptador genera un nonce por peticion, lo aplica a los scripts y emite la cabecera; en SSG no hay peticion, asi que se emite el hash de cada script en un `<meta http-equiv>` de la propia pagina, como hace Astro.

  ```ts
  await createServer({ port: 3000, csp: true });
  await runSsg({ csp: true });
  ```

  El hasher vive en `@calumet/suamox/csp` para que `index.ts`, que tambien se carga en el navegador, no tenga que importar `node:crypto`.

### Correcciones

- **`hono-adapter`: los scripts inline del servidor de desarrollo se inyectaban con `String.replace` y una cadena de reemplazo.** En esa posicion `$&` y `` $` `` son patrones de sustitucion, asi que un `resolve` que los contuviera reinyectaba el HTML anterior —con su `</script>` dentro— y cerraba el bloque antes de tiempo. El escape del payload no lo veia, porque ese `</script>` lo metia el propio `replace` despues de escapar. Ahora el reemplazo va en funcion, que desactiva los patrones. Afectaba tambien a la inyeccion de `window.__INITIAL_DATA__`, que ya estaba antes.

### Packages

| Paquete                        | Version anterior | Nueva version |
| ------------------------------ | ---------------- | ------------- |
| `@calumet/suamox`              | 0.3.1            | 0.4.0         |
| `@calumet/suamox-router`       | 0.5.0            | 0.6.0         |
| `@calumet/suamox-hono-adapter` | 0.5.0            | 0.6.0         |

## 0.11.0 (2026-09-05)

### Features

- **`vite-plugin-pages`: el build del cliente falla si codigo de servidor llego al bundle.** El stripping de exports y el bloqueo de `.server.ts` actuan mientras se resuelve el import; los dos son la primera linea, y hasta ahora nadie comprobaba el resultado. Al cerrar el build del cliente el plugin recorre los modulos que quedaron en cada chunk y aborta si encuentra un `*.server.*`, una ruta de `src/api/` o un builtin de Node.

  ```txt
  [suamox:pages] Server-only code reached the client bundle:

    assets/informe-Dcku00bO.js
      - __vite-browser-external (Node builtin, unavailable in the browser)
  ```

  Mira los modulos que el bundler incluyo, no el texto del bundle, asi que no depende de que un nombre sobreviva al minificador ni se le escapa por un identificador renombrado. Cubre lo que evade a los otros dos mecanismos: un alias, otro plugin que resuelve antes, un import dinamico. El caso que atrapa en la practica es mas simple: usar `node:fs` en el componente en vez de en el loader, que ningun mecanismo anterior veia porque el import es legitimo hasta que se decide para que bundle va.

  El nombre del chunk apunta a la pagina culpable. Vite no deja `node:fs` tal cual en el bundle del navegador —lo sustituye por un stub vacio, `__vite-browser-external`— asi que ese stub es la huella que se busca, no el nombre del modulo.

### Packages

| Paquete                             | Version anterior | Nueva version |
| ----------------------------------- | ---------------- | ------------- |
| `@calumet/suamox-vite-plugin-pages` | 0.7.0            | 0.8.0         |

## 0.10.0 (2026-09-05)

### Features

- **`vite-plugin-pages`: `src/pages/root.tsx`, el nivel de app que no se salta nadie.** `export const layout = false` sacaba a la pagina de toda la cadena, y ahi se iba tambien `src/pages/layout.tsx`. Ese no era un layout mas: al no haber ningun envoltorio por encima de las rutas, era el unico sitio donde una app podia montar lo que necesita cada pantalla. Una app con el proveedor de i18n ahi veia las pantallas con la bandera salir con las claves en crudo, y la redireccion de idioma que vivia en su loader dejaba de correr. Ninguna de las dos falla al compilar ni al servir: responden 200 y el defecto solo se ve leyendo el HTML.

  ```tsx
  // src/pages/root.tsx
  export function loader({ url }: LoaderContext) {
    return { idioma: idiomaDeLaUrl(url) };
  }

  export default function Root({ children }: { children: ReactNode }) {
    const { idioma } = useRouteLoaderData<typeof loader>("root")!;
    return <I18nProvider idioma={idioma}>{children}</I18nProvider>;
  }
  ```

  Envuelve todas las rutas, va por encima de la cadena de layouts y `layout = false` ya no se lo salta: lo que la bandera quita es el cromo de la carpeta, no la app. Es un layout a todos los efectos —acepta `loader`, sus datos se leen con `useRouteLoaderData("root")`, un `redirect()` desde ahi aplica a toda la app, y su CSS entra en el HTML prerenderizado— solo que siempre primero en la cadena. Su route ID es `"root"`, no `layout:root`, que sigue siendo el de `src/pages/layout.tsx`.

  Es el reparto de Nuxt, de donde viene `layout: false`: `app.vue` por encima y los layouts debajo, asi que la bandera nunca tira los proveedores. Remix y React Router llegan a lo mismo por otra via —`padre_.hijo` te saca del layout intermedio pero te sigue anidando en `root.tsx`— y Next directamente hace obligatorio el layout raiz. Los tres coinciden en que hay un nivel que no se salta.

  Es opcional: una app sin `root.tsx` no cambia en nada. Solo cuenta en la raiz de `pages/`; uno anidado en una subcarpeta sigue siendo una pagina normal.

### Breaking Changes

- **`src/pages/root.tsx` deja de ser una ruta.** Una app que tuviera ese archivo como pagina servia `/root`; ahora pasa a ser el envoltorio de la app. Renombrar el archivo si se quiere conservar la ruta. Solo aplica al que este en la raiz de `pages/`.

### Packages

| Paquete                             | Version anterior | Nueva version |
| ----------------------------------- | ---------------- | ------------- |
| `@calumet/suamox-vite-plugin-pages` | 0.6.1            | 0.7.0         |

## 0.9.1 (2026-09-05)

### Correcciones

- **`ssr-runtime`: el HTML prerenderizado perdia el CSS de la pagina y de sus layouts.** El SSG buscaba en el manifest de Vite con la ruta del modulo relativa a la raiz (`src/pages/blog/index.tsx`), pero el build del cliente importa paginas y layouts con el query de stripping que agrega `@calumet/suamox-vite-plugin-pages`, asi que el manifest las indexa como `src/pages/blog/index.tsx?__suamox-client-route`. Ninguna clave coincidia, la unica entrada que aportaba estilos era la de `index.html`, y un `import "./blog.css"` dentro de una pagina o de un layout no dejaba `<link>` en el HTML estatico. Como el HTML prerenderizado no trae scripts, esos estilos no llegaban nunca: la pantalla salia sin ellos. Ahora la clave se arma con el query, con lo que el CSS de la ruta y el de cada layout entran en el HTML.

### Packages

| Paquete                             | Version anterior | Nueva version |
| ----------------------------------- | ---------------- | ------------- |
| `@calumet/suamox`                   | 0.3.0            | 0.3.1         |
| `@calumet/suamox-vite-plugin-pages` | 0.6.0            | 0.6.1         |

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
