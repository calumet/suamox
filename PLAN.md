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
