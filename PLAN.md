# Plan de implementación — Meta-framework (Suamox) instalable (Vite + React + Hono) con SSR/SSG + Filesystem Routing

## Objetivo

Construir un conjunto de paquetes publicables en npm (en un repo separado) que permita que múltiples proyectos de frontend del grupo puedan instalarlo y obtener:

- **Filesystem routing estilo Astro** (sin `+`): `src/pages/**`
- **SSR** (render por request) usando **Hono** como servidor
- **SSG** (pre-render a HTML estático)
- **DX consistente**: mismos scripts, misma estructura, misma forma de hacer loader/layout/404
- (Fase 2) **Islas / partial hydration** (opcional)

---

## Alcance (MVP)

### Features mínimas

1. **Routing por filesystem**

- `src/pages/index.tsx` → `/`
- `src/pages/about.tsx` → `/about`
- `src/pages/blog/index.tsx` → `/blog`
- `src/pages/blog/[slug].tsx` → `/blog/:slug`
- `src/pages/[...all].tsx` → catch-all
- Carpetas de grupo opcional: `src/pages/(admin)/dashboard.tsx` → `/dashboard` (no incluye el nombre del grupo en URL)

2. **SSR (Hono)**

- Manejo de requests HTML con `react-dom/server`
- Inyección de `head`, `body` y scripts del cliente
- Soporte de status codes (200/404/500)
- Página 404: `src/pages/404.tsx` o fallback automático

3. **Hydration cliente**

- `entry-client` que hidrate el árbol principal (MVP)
- Estado inicial (`window.__INITIAL_DATA__`) para loaders

4. **Data loading**

- Convención por página:
  - `export async function loader(ctx): Promise<any>`
  - Se ejecuta en SSR y también en SSG
- `ctx` debe incluir al menos: `{ request, url, params, query }`

5. **SSG**

- Comando para prerender que:
  - genera `dist/static/**/index.html`
  - copia/usa assets client `dist/client/**`
- Rutas dinámicas en SSG:
  - `export async function getStaticPaths(): Promise<Array<{ params: ... }>>`
- Control de prerender:
  - `export const prerender = true | false` (default: false o true según decisión del equipo)

---

## Paquetes (repo de framework, publicado en npm)

### 1) `@org/vite-plugin-pages` (core del routing)

**Responsabilidad**

- Escanear `src/pages/**`
- Generar un **módulo virtual** con el manifest de rutas: `virtual:pages`
- Actualización en dev (HMR): cuando se crean/eliminen/renombren páginas, refrescar el manifest

**Entregables**

- Plugin de Vite con:
  - `resolveId("virtual:pages")`
  - `load("virtual:pages")` → exporta `routes[]`
  - watcher + invalidación
- Parser de path → route record:
  - `index` handling
  - `[param]` params
  - `[...param]` splat
  - `(group)` removal
- Ordenamiento de rutas (prioridad):
  - estáticas > dinámicas > catch-all
  - rutas más profundas primero, etc.

**Criterios de aceptación**

- Cambios en `src/pages` reflejan rutas sin reiniciar dev server
- Manifest generado correctamente y estable en build

---

### 2) `@org/ssr-runtime` (router runtime + SSR + SSG helpers)

**Responsabilidad**

- Match URL → componente de página
- Ejecutar `loader()`
- Render SSR y empaquetar resultado `{ html, head, status, initialData }`
- API de SSG (prerender) compartida

**APIs sugeridas**

- `matchRoute(routes, pathname) -> { route, params } | null`
- `renderPage({ pathname, request, routes, mode }) -> { status, html, head, initialData }`
- `prerender({ routes, outDir, baseUrl? })`

**Criterios de aceptación**

- SSR devuelve 200/404 correctamente
- `params` se inyecta y `loader()` recibe el ctx correcto
- `initialData` se serializa seguro (escape XSS básico)

---

### 3) `@org/hono-adapter` (servidor Hono listo para usar)

**Responsabilidad**

- Proveer una API de servidor que funcione igual en todos los proyectos:
  - Dev: integra Vite + SSR (usando `vite.ssrLoadModule`)
  - Prod: sirve `dist/client` y usa bundle SSR de `dist/server`
- Permitir middleware/hook de usuario

**APIs sugeridas**

- `createHonoApp(options) -> Hono`
- `createDevHandler(options)` / `createProdHandler(options)` (interno)
- Hooks:
  - `onRequest?(c) -> void`
  - `onBeforeRender?(ctx) -> ctx`
  - `onAfterRender?(result) -> result`

**Criterios de aceptación**

- `pnpm dev` funciona con HMR
- `pnpm build && pnpm start` sirve SSR en prod
- Assets se sirven correctamente (JS/CSS)

---

### 4) `@org/cli` (opcional pero recomendado)

**Responsabilidad**

- Estandarizar comandos en todos los proyectos:
  - `org-fw dev` (dev server)
  - `org-fw build` (client + server)
  - `org-fw ssg` (prerender)
  - `org-fw preview` (servir resultado estático o SSR)
- Evitar que cada repo copie scripts complejos

**Criterios de aceptación**

- Un proyecto nuevo solo necesita scripts simples y config mínima

---

### 5) `@org/create-app` (opcional)

**Responsabilidad**

- Scaffold de un proyecto con:
  - `src/pages` demo
  - `server.ts` Hono
  - `vite.config.ts` ya configurado
  - scripts

---

## Estructura del repo del framework

```
packages/
  framework-repo/
  packages/
  vite-plugin-pages/
  ssr-runtime/
  hono-adapter/
  cli/
create-app/
examples/
docs/
getting-started.md
routing.md
ssr.md
ssg.md
loaders.md
deployment.md
pnpm-workspace.yaml
```

---

## Convenciones y DX (documentar y congelar temprano)

### Routing

- Directorio: `src/pages`
- Extensiones: `.tsx` (aceptar `.ts/.jsx/.js` opcional)
- Reglas:
  - `index.tsx` es raíz del folder
  - `[slug].tsx` param
  - `[...all].tsx` catch-all
  - `(group)` no entra en URL
- 404:
  - `src/pages/404.tsx` (si existe) o fallback

### Layouts (MVP o Fase 1.5)

Layout por folder: `layout.tsx` (similar a Astro)

### Datos

- `loader(ctx)` (SSR + SSG)
- `getStaticPaths()` para dinámicos en SSG
- `prerender` flag por página

---

## Pipeline de build (SSR y SSG)

### `build` (SSR)

- `vite build` client → `dist/client`
- `vite build --ssr src/entry-server.tsx` → `dist/server`
- `hono-adapter` en prod:
  - sirve `dist/client`
  - importa `dist/server/entry-server.js`
  - usa `virtual:pages` “congelado” para match

### `ssg`

- Ejecuta un script Node/Bun:
  - carga `routes` (manifest)
  - determina lista de rutas:
    - estáticas: por manifest
    - dinámicas: `getStaticPaths()`
  - por cada ruta:
    - ejecuta render SSR en modo “prerender”
    - escribe HTML en `dist/static/<ruta>/index.html`
  - copia assets client

---

## Plan por fases (con hitos claros)

### Fase 0 — Decisiones de diseño (1–2 sesiones)

- Definir convención exacta de routing
- Definir contrato de `loader/getStaticPaths/prerender`
- Decidir runtime objetivo inicial (Node recomendado)
- Definir estructura de output (dist/client, dist/server, dist/static)

**Salida**

- Documento “Conventions v1” congelado

---

### Fase 1 — Routing y manifest (MVP)

- Implementar `@org/vite-plugin-pages`
- Tests unitarios del parser (path → route record)
- HMR básico (invalidate virtual module)

**Salida**

- `virtual:pages` estable en dev y build

---

### Fase 2 — SSR runtime (MVP)

- Implementar matcher + SSR render mínimo (sin layouts si hace falta)
- Integrar `loader()` + `params`
- Template HTML básico + escape de JSON

**Salida**

- Render SSR de una página simple

---

### Fase 3 — Hono adapter (Dev + Prod)

- Dev:
  - crear Vite dev server
  - handler Hono que llama SSR via `ssrLoadModule`
- Prod:
  - servir estáticos
  - cargar bundle SSR
- Manejo de errores (500) y 404

**Salida**

- `pnpm dev` y `pnpm build && pnpm start` funcionando en ejemplo

---

### Fase 4 — SSG (Prerender)

- Implementar `prerender()` con:
  - rutas estáticas
  - `getStaticPaths()` para dinámicas
- Escribir archivos a `dist/static`
- Añadir `preview` para estático (sirviendo `dist/static`)

**Salida**

- Sitio estático generado correctamente con assets

---

### Fase 5 — Layouts (si no se incluyó antes)

- Resolver layouts por folder
- Orden de aplicación (root → leaf)
- Soporte de head (mínimo `title`/`meta`)

**Salida**

- Layouts reusables por sección, similar a Astro

---

### Fase 6 — CLI + Create-app (recomendado)

- CLI con comandos estándar
- Generador de proyecto
- Docs “Getting Started” + ejemplo

**Salida**

- Instalar y arrancar un proyecto en minutos

---

### Fase 7 — Islas (opcional, fase avanzada)

- API `<Island client="visible|idle|load" />`
- Runtime cliente que hidrata por isla
- Build: entrypoints por isla o chunk splitting controlado

**Salida**

- Demo con página SSR+SSG y widgets hidratados selectivamente

---

### Fase 8 — Server code stripping (seguridad de bundles)

#### Problema

Los archivos de pagina (`src/pages/*.tsx`) exportan tanto el componente como el `loader`. El codegen del cliente solo accede a `_module.default`, pero el `import()` dinamico carga el modulo completo. Vite/Rollup elimina exports no usados via tree-shaking en produccion, pero tree-shaking tiene limitaciones:

1. **Side-effects a nivel de modulo**: si el loader importa un modulo que ejecuta codigo al ser importado (ej: un cliente de base de datos que se conecta al importarse, un `console.log` en el top-level), el bundler no puede eliminarlo porque debe preservar los side-effects.
2. **Paquetes sin `"sideEffects": false`**: si un paquete npm no declara `"sideEffects": false` en su `package.json`, el bundler asume que tiene side-effects y no lo elimina aunque no se use.
3. **Re-exports transitivos**: si el loader importa de un barrel file (`import { db } from "../lib"`) y ese barrel re-exporta otros modulos con side-effects, todo el barrel puede terminar en el bundle.

En desarrollo no hay tree-shaking (Vite sirve modulos individuales), pero los loaders no se ejecutan en el cliente porque el router usa `/__data`. El riesgo real es en produccion si el codigo del loader o sus dependencias terminan en el bundle del cliente.

#### Como lo resuelve Remix

Remix no depende del tree-shaking. Su compilador genera un **modulo proxy** por cada archivo de ruta:

```ts
// Archivo original: routes/blog.$slug.tsx
export async function loader({ params }) {
  const post = await db.post.findUnique({ where: { slug: params.slug } });
  return json(post);
}

export function meta({ data }) {
  return [{ title: data.title }];
}

export default function BlogPost() {
  const data = useLoaderData();
  return <h1>{data.title}</h1>;
}
```

```ts
// Proxy generado por el compilador (solo para el browser bundle)
export { meta, default } from "./routes/blog.$slug.tsx";
// loader NO se re-exporta, por lo tanto ni loader ni db entran al grafo de imports
```

Adicionalmente, Remix ofrece la convencion `.server.ts`: nombrar un archivo `db.server.ts` le indica al compilador que nunca lo incluya en el bundle del cliente. Si algun codigo del cliente intenta importar un `.server.ts`, el build falla con error en vez de incluir silenciosamente codigo del servidor.

#### Implementar

1. **Plugin de Vite (`transform` hook)**: interceptar imports de archivos dentro de `src/pages/` durante el build del cliente. Reemplazar el contenido del modulo con un proxy que solo re-exporte los exports seguros para el cliente:
   - `default` (componente)
   - `prerender` (flag boolean)
   - `csr` (flag boolean)
   - Eliminar del proxy: `loader`, `getStaticPaths`, y cualquier import que solo estos usen

2. **Convencion `.server.ts`**: archivos nombrados `*.server.ts` (ej: `db.server.ts`, `api.server.ts`) deben ser excluidos del bundle del cliente. El plugin debe lanzar un error de build si un modulo del cliente intenta importar un `.server.ts`.

3. **Validacion post-build**: script o plugin que analice el bundle del cliente generado y verifique que no contiene patrones conocidos de codigo server-only (imports de `node:*`, referencias a `process.env` sensibles, nombres de funciones loader).

4. **Documentar las restricciones de modulos**: guia explicando que los side-effects a nivel de modulo en archivos de pagina pueden filtrarse al cliente, y como evitarlo (mover side-effects dentro del loader, usar `.server.ts` para dependencias server-only).

#### Salida

- Garantia de que `loader()`, `getStaticPaths()`, middleware y sus dependencias no llegan al browser
- Convencion `.server.ts` documentada y con error de build si se viola
- Guia de restricciones de modulos en `docs/guias/`

---

### Fase 9 — Prehydrate state (`useClientValue`)

#### Problema: hydration snap

Cuando una pagina SSR depende de estado que solo existe en el cliente (sessionStorage, localStorage, cookies JS, navigator), el HTML del servidor se renderiza con un valor por defecto (ej: `isLoggedIn = false`). Cuando React hidrata, detecta el valor real y actualiza el DOM, causando un "snap" visible (flash de contenido incorrecto).

Este problema es inherente al modelo de hidratacion de React. Ningun framework de React (Next.js, Remix, Astro) lo resuelve automaticamente. Qwik lo evita con resumability (no usa hidratacion), pero no aplica al ecosistema React.

El patron para resolverlo esta documentado en el articulo "A clock that doesn't snap" de Ethan Niser (https://ethanniser.dev/blog/a-clock-that-doesnt-snap) y consiste en:

1. SSR renderiza el HTML con un valor por defecto
2. Un `<script>` inline colocado justo despues de los elementos afectados se ejecuta antes de que React hidrate
3. El script computa el valor real usando APIs del browser (sessionStorage, etc.) y parchea el DOM directamente
4. El script guarda el valor en una variable global (`window.__PREHYDRATE__`)
5. Cuando React hidrata, `useState` lee de `window.__PREHYDRATE__` en vez del default, evitando hydration mismatch

El resultado es que el usuario nunca ve el estado incorrecto: el inline script corrige el DOM antes del primer paint visible, y React hidrata con el mismo valor sin mismatch.

#### Implementacion actual (manual)

Hoy el dev tiene que escribir este patron a mano en cada componente:

```tsx
// Declarar la variable global
declare global {
  interface Window {
    __AUTH__?: boolean;
  }
}

export function Header() {
  // 5. React lee el valor pre-computado al hidratar
  const [isLoggedIn] = useState(() => {
    if (typeof window !== "undefined" && window.__AUTH__ !== undefined) {
      return window.__AUTH__;
    }
    return false; // 1. Default para SSR
  });

  return (
    <header>
      {/* Botones con style condicional basado en isLoggedIn */}
      <button id="btn-logout" style={isLoggedIn ? undefined : { display: "none" }}>
        Salir
      </button>
      <a id="btn-login" style={isLoggedIn ? { display: "none" } : undefined}>
        Ingresar
      </a>

      {/* 2-4. Inline script que corre antes de React */}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){
        var logged = !!sessionStorage.getItem("idUsr");
        window.__AUTH__ = logged;
        var login = document.getElementById("btn-login");
        var logout = document.getElementById("btn-logout");
        if (login) login.style.display = logged ? "none" : "";
        if (logout) logout.style.display = logged ? "" : "none";
      })()`,
        }}
      />
    </header>
  );
}
```

Este patron funciona pero es verbose, propenso a errores, y requiere mantener la logica de DOM duplicada entre el script inline y el JSX.

#### API propuesta: `useClientValue`

```tsx
useClientValue(fallback, resolve, patch?)
```

- `fallback`: valor para SSR (ej: `false`)
- `resolve`: funcion que computa el valor real en el cliente. Se serializa via `.toString()` para el inline script. No puede usar imports ni closures externas, solo APIs del browser.
- `patch` (opcional): puede ser un objeto declarativo o una funcion manual.

**Tipo del tercer argumento:**

```ts
type PatchDeclarative = {
  show?: string; // selector CSS, se muestra cuando value es truthy
  hide?: string; // selector CSS, se oculta cuando value es truthy
};

type PatchManual<T> = (value: T) => void;

type Patch<T> = PatchDeclarative | PatchManual<T>;
```

**Uso declarativo (casos comunes):**

La mayoria de casos de prehydrate son toggles de visibilidad basados en un boolean. El objeto declarativo abstrae la manipulacion de DOM.

La estrategia principal usa `data-cv-hide` attributes y una regla CSS global inyectada por el framework:

```css
/* CSS inyectado automaticamente por el framework */
[data-cv-hide] {
  display: none !important;
}
```

El dev marca los elementos con `data-cv-hide` condicional y el inline script toggle el atributo antes de React:

```tsx
import { useClientValue } from "@calumet/suamox";

export function Header() {
  const isLoggedIn = useClientValue(
    false,
    () => {
      return !!sessionStorage.getItem("idUsr");
    },
    {
      show: "#btn-logout",
      hide: "#btn-login",
    },
  );

  return (
    <header>
      <button id="btn-logout" data-cv-hide={!isLoggedIn || undefined}>
        Salir
      </button>
      <a id="btn-login" data-cv-hide={isLoggedIn || undefined}>
        Ingresar
      </a>
    </header>
  );
}
```

El framework genera el inline script automaticamente:

```js
// generado internamente
(function () {
  var __v = (function () {
    return !!sessionStorage.getItem("idUsr");
  })();
  window.__PREHYDRATE__ = window.__PREHYDRATE__ || {};
  window.__PREHYDRATE__["auth_0"] = __v;
  document.querySelectorAll("#btn-logout").forEach(function (el) {
    if (__v) el.removeAttribute("data-cv-hide");
    else el.setAttribute("data-cv-hide", "");
  });
  document.querySelectorAll("#btn-login").forEach(function (el) {
    if (__v) el.setAttribute("data-cv-hide", "");
    else el.removeAttribute("data-cv-hide");
  });
})();
```

El flujo es:

1. SSR: `isLoggedIn=false`, logout tiene `data-cv-hide`, CSS lo oculta
2. Inline script: computa `true`, remueve `data-cv-hide` de logout, lo agrega a login
3. React hidrata: `isLoggedIn=true`, JSX coincide con el DOM (logout sin attr, login con attr)
4. Sin mismatch, sin flash

Si durante la implementacion `data-cv-hide` presenta problemas (ej: conflictos con CSS existente, especificidad insuficiente con `!important`, o frameworks de UI que sobreescriben `display`), se puede usar `style.display` como fallback:

```js
// fallback: manipulacion directa de style
document.querySelectorAll("#btn-logout").forEach(function (el) {
  el.style.display = __v ? "" : "none";
});
```

En ese caso el dev usaria `style` condicional en el JSX en vez de `data-cv-hide`:

```tsx
<button id="btn-logout" style={isLoggedIn ? undefined : { display: "none" }}>
```

`show` y `hide` aceptan cualquier selector CSS valido, incluyendo clases:

```tsx
// Toggle de secciones completas
const isLoggedIn = useClientValue(
  false,
  () => {
    return !!sessionStorage.getItem("idUsr");
  },
  {
    show: "#noticias-auth",
    hide: "#noticias-guest",
  },
);

// Con clases
const isLoggedIn = useClientValue(
  false,
  () => {
    return !!sessionStorage.getItem("idUsr");
  },
  {
    show: ".auth-only",
    hide: ".guest-only",
  },
);
```

**Uso manual (escape hatch para casos complejos):**

Cuando el patch no es un toggle de display (ej: cambiar texto, atributos, clases), se pasa una funcion:

```tsx
const time = useClientValue(
  "00:00:00",
  () => {
    return new Date().toLocaleTimeString();
  },
  (value) => {
    document.getElementById("clock")!.textContent = value;
  },
);
```

**Uso sin patch (solo sync de state):**

```tsx
const locale = useClientValue("en", () => {
  return navigator.language.startsWith("es") ? "es" : "en";
});
```

Sin patch no hay correccion visual pre-hidratacion. React hidrata con el valor correcto (sin mismatch), pero el HTML del servidor se muestra con el fallback hasta que React hidrate. Esto es aceptable cuando el cambio visual es menor.

#### `suppressHydrationWarning` y por que es necesario

El inline script modifica el DOM antes de que React hidrate. Pero React no compara contra el DOM actual del browser, sino contra lo que el servidor renderizo. Cuando React hidrata y ve que un atributo (ej: `style`) es diferente a lo que el servidor genero, emite un hydration mismatch warning:

```
+  style={undefined}        ← lo que React quiere renderizar (isLoggedIn=true)
-  style={{display:"none"}}  ← lo que el servidor renderizo (isLoggedIn=false)
```

Esto ocurre porque:

1. SSR renderizo con `fallback=false` (logout oculto)
2. El inline script parcheo el DOM (logout visible)
3. React hidrata con `resolve()=true` (logout deberia estar visible)
4. React detecta que el atributo `style` del HTML del servidor no coincide con su render

El warning es cosmetic (React adopta el valor del cliente), pero para silenciarlo los elementos parchados necesitan `suppressHydrationWarning`:

```tsx
<button id="btn-logout" suppressHydrationWarning data-cv-hide={!isLoggedIn || undefined}>
  Salir
</button>
```

Esto es lo mismo que hace el articulo original de Ethan Niser. `suppressHydrationWarning` le dice a React: "se que este elemento va a diferir entre servidor y cliente, no es un error".

Con la estrategia `data-cv-hide`, el mismatch es minimo (solo el atributo `data-cv-hide` difiere). Con la estrategia `style.display`, el mismatch es en el atributo `style`. En ambos casos `suppressHydrationWarning` es necesario.

Adicionalmente, cualquier valor derivado de APIs del browser dentro del JSX (no dentro de `resolve`) tambien causa mismatch. Por ejemplo:

```tsx
// MISMATCH: en SSR typeof window === "undefined", en cliente es true
const loginHref =
  typeof window !== "undefined"
    ? `/${lang}/login?redirect=${encodeURIComponent(window.location.pathname)}`
    : `/${lang}/login`;
```

Estas branches server/client deben moverse dentro de `useClientValue` o marcarse con `suppressHydrationWarning` en el elemento que las usa. El framework podria agregar `suppressHydrationWarning` automaticamente a los elementos seleccionados por `show`/`hide` en una implementacion futura, pero eso requiere control sobre el JSX que no es trivial.

#### Restricciones de `resolve` y `patch`

Tanto `resolve` como `patch` (cuando es funcion) se serializan con `.toString()` para inyectarse en el inline script. Esto implica que:

- No pueden importar modulos externos
- No pueden referenciar variables del scope del componente (closures)
- Solo pueden usar APIs globales del browser: `sessionStorage`, `localStorage`, `document`, `navigator`, `window`, `Date`, etc.
- Deben ser puras respecto a su entorno: todo lo que necesitan debe estar disponible globalmente

Esto es una limitacion inherente al patron: el inline script se ejecuta fuera del contexto de React, en un `<script>` tag que el browser interpreta como JS plano.

#### Implementar

1. **Hook `useClientValue`** en `ssr-runtime`:
   - En servidor: retorna `fallback`, registra el inline script para inyeccion
   - En cliente: lee de `window.__PREHYDRATE__[key]` si existe, sino usa `fallback`
   - Genera un key unico por invocacion (hash o contador)

2. **Inyeccion del `<script>` inline**:
   - Opcion A: el hook retorna una tupla `[value, ScriptComponent]` donde `ScriptComponent` es un componente React que renderiza el `<script>` inline. El dev debe colocarlo en su JSX. Mas explicito pero requiere que el dev recuerde renderizarlo.
   - Opcion B: el framework recolecta todos los registros durante SSR y los inyecta automaticamente antes de `</body>`. Mas magico pero el dev no tiene que hacer nada extra. Riesgo: el script debe estar despues de los elementos que parchea, y si se inyecta al final del body podria haber un gap visual.
   - Opcion C: el hook retorna `[value, ScriptComponent]` y el dev lo coloca justo despues de los elementos afectados (patron del articulo original). Equilibrio entre control y conveniencia.

3. **Documentar** el patron, las restricciones de serialization, y ejemplos para casos comunes: auth, dark mode, locale, feature flags.

#### Salida

- Hook `useClientValue(fallback, resolve, patch?)` en `@calumet/suamox`
- Documentacion en `docs/guias/prehydrate.md`
- Ejemplo en `examples/basic` con auth toggle

---

## Testing / Calidad

### Unit tests

- Parser de rutas (todos los casos: index, params, splat, groups)
- Orden de prioridad de rutas
- Serialización segura del `initialData`

### Integration tests

- Dev SSR: request a `/`, `/blog/abc`, `/nope`
- Build SSR: sirve assets y render
- SSG: genera html correcto + rutas dinámicas
- Islas (si aplica)

---

## Documentación mínima (en `docs/`)

- `getting-started.md` (instalación + scripts)
- `routing.md` (convenciones + ejemplos)
- `data-loading.md` (loader/getStaticPaths/prerender)
- `ssr.md` (cómo funciona, hooks del server)
- `ssg.md` (cómo generar y desplegar)
- `deployment.md` (Node; opcional Cloudflare/Bun más adelante)

---

## Ejemplo de “contrato” para las páginas (propuesto)

```ts
// src/pages/blog/[slug].tsx
export const prerender = true;

export async function getStaticPaths() {
  return [{ params: { slug: "hola" } }, { params: { slug: "mundo" } }];
}

export async function loader({ params }) {
  return { slug: params.slug };
}

export default function Page({ data }) {
  return <h1>{data.slug}</h1>;
}
```

---

## Definition of Done (MVP)

Un proyecto consumer puede:

1. instalar `@org/vite-plugin-pages`, `@org/ssr-runtime`, `@org/hono-adapter` (y opcional CLI)
2. crear `src/pages` y `server.ts`
3. correr **dev SSR** con HMR
4. construir **SSR prod**
5. generar **SSG** con rutas estáticas y dinámicas
   La API y convenciones están documentadas y versionadas (`v1`).
