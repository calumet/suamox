# Suamox Framework — Conventions v1

**Status:** ✅ Frozen (Fase 0 completada)
**Last Updated:** 2026-01-18

Este documento define las convenciones y contratos del framework Suamox que **no deben cambiar** durante el desarrollo del MVP. Cambios a estas convenciones requieren crear una nueva versión del documento.

---

## 1. Routing Convention

### 1.1 Directorio base

- **Ruta:** `src/pages/`
- **Extensiones soportadas:** `.tsx`, `.ts`
  - `.tsx` es requerido para componentes React
  - `.ts` puede usarse para API routes o páginas que retornan Response

### 1.2 Reglas de mapeo de rutas

| Archivo                           | URL           | Descripción                       |
| --------------------------------- | ------------- | --------------------------------- |
| `src/pages/index.tsx`             | `/`           | Raíz del sitio                    |
| `src/pages/about.tsx`             | `/about`      | Página estática                   |
| `src/pages/blog/index.tsx`        | `/blog`       | Index de carpeta                  |
| `src/pages/blog/[slug].tsx`       | `/blog/:slug` | Parámetro dinámico                |
| `src/pages/docs/[...path].tsx`    | `/docs/*`     | Catch-all (rest params)           |
| `src/pages/(admin)/dashboard.tsx` | `/dashboard`  | Grupo de rutas (no afecta URL)    |
| `src/pages/404.tsx`               | N/A           | Página de error 404 personalizada |

### 1.3 Prioridad de matching (orden descendente)

1. Rutas estáticas exactas (`/about`)
2. Rutas con parámetros (`/blog/:slug`)
3. Catch-all routes (`/docs/*`)
4. 404 page (fallback final)

Cuando dos rutas tienen la misma prioridad, las **más profundas** (más segmentos) tienen precedencia.

### 1.4 Grupos de rutas

- Sintaxis: `(nombre-grupo)`
- **No** se incluyen en la URL final
- Uso: organización lógica y layouts compartidos
- Ejemplo: `src/pages/(auth)/login.tsx` → `/login`

### 1.5 Página 404

- Archivo: `src/pages/404.tsx` (opcional)
- Si no existe, el framework provee un fallback básico
- Se renderiza con status `404`

---

## 2. Page Contract (Exportaciones de página)

Cada archivo en `src/pages/` puede exportar:

### 2.1 Default export (obligatorio)

```tsx
export default function Page({ data }: { data: any }) {
  return <div>...</div>;
}
```

- **Tipo:** Componente React
- **Props recibidas:**
  - `data`: resultado del `loader()` (si existe)

### 2.2 `loader()` (opcional)

```tsx
export async function loader(ctx: LoaderContext) {
  return {
    /* datos */
  };
}
```

- **Cuándo se ejecuta:**
  - En SSR: por cada request
  - En SSG: durante el prerender
- **Contexto (`ctx`):**
  ```ts
  interface LoaderContext {
    request: Request; // Request Web API
    url: URL; // URL parseada
    params: Record<string, string>; // Parámetros de ruta
    query: URLSearchParams; // Query params
  }
  ```
- **Return:** cualquier objeto JSON-serializable
- **Notas:**
  - El resultado se pasa al componente como `data` prop
  - En SSR, se serializa en `window.__INITIAL_DATA__`

### 2.3 `getStaticPaths()` (opcional, solo para rutas dinámicas en SSG)

```tsx
export async function getStaticPaths() {
  return [{ params: { slug: 'hola' } }, { params: { slug: 'mundo' } }];
}
```

- **Cuándo se requiere:**
  - Si la página tiene parámetros dinámicos (`[slug]`, `[...path]`) **Y** se va a prerender
- **Return:** Array de objetos con `params`
- **Notas:**
  - Cada objeto define una ruta a generar
  - `params` debe coincidir con los nombres en el filename

### 2.4 `prerender` (opcional)

```tsx
export const prerender = true;
```

- **Tipo:** `boolean`
- **Default:** `false` (opt-in a SSG)
- **Comportamiento:**
  - `true`: la página se pre-renderiza durante `build:ssg`
  - `false`: la página solo se renderiza en SSR (request-time)

---

## 3. Layouts

### 3.1 Archivo de layout

- **Nombre:** `layout.tsx` dentro de cualquier carpeta en `src/pages/`
- **Alcance:** aplica a todas las páginas en la misma carpeta y subcarpetas

### 3.2 Layout component contract

```tsx
// src/pages/blog/layout.tsx
export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <nav>Blog Nav</nav>
      {children}
    </div>
  );
}
```

- **Props:**
  - `children`: el contenido de la página o layout anidado

### 3.3 Orden de aplicación

Los layouts se aplican desde la raíz hacia la hoja:

```
src/pages/layout.tsx              (Root layout)
  → src/pages/blog/layout.tsx     (Blog layout)
    → src/pages/blog/[slug].tsx   (Page)
```

### 3.4 Head metadata (futuro)

En MVP, los layouts pueden renderizar contenido de `<head>` mediante una solución básica (e.g., Context API o prop drilling). Soluciones más sofisticadas (e.g., `<Head>` component) pueden añadirse en fases posteriores.

---

## 4. Data Flow

### 4.1 SSR (Server-Side Rendering)

```
Request → Match route → Execute loader() → Render React tree → Inject HTML + initialData → Response
```

1. Hono recibe request
2. Router encuentra la ruta matching
3. Se ejecuta `loader(ctx)` con params/query
4. Se renderiza el componente con `data` del loader
5. Se serializa `data` en `<script>window.__INITIAL_DATA__ = ...</script>`
6. Se retorna HTML completo

### 4.2 SSG (Static Site Generation)

```
Build → Get all routes → For each route: Execute loader() → Render HTML → Write to disk
```

1. Recolectar rutas:
   - Estáticas: del manifest
   - Dinámicas: ejecutar `getStaticPaths()`
2. Para cada ruta:
   - Ejecutar `loader()` (si existe)
   - Renderizar React tree
   - Escribir `dist/static/<ruta>/index.html`
3. Copiar assets client (`dist/client/`)

### 4.3 Client Hydration

```html
<script>
  window.__INITIAL_DATA__ = {"/blog/hola": {...}}
</script>
<script type="module" src="/client/entry-client.js"></script>
```

El `entry-client.js`:

1. Lee `window.__INITIAL_DATA__[currentPath]`
2. Pasa data al componente de página
3. Ejecuta `hydrateRoot()` para hidratar el árbol React

---

## 5. Output Structure

### 5.1 `dist/` después de `build` (SSR)

```
dist/
├── client/              # Assets del cliente (JS, CSS, imágenes)
│   ├── entry-client.js
│   ├── entry-client.css
│   └── assets/
│       └── [hash].js
└── server/              # Bundle SSR
    └── entry-server.js
```

### 5.2 `dist/` después de `build:ssg` (SSG)

```
dist/
├── static/              # HTML prerenderizado
│   ├── index.html
│   ├── about/
│   │   └── index.html
│   └── blog/
│       ├── index.html
│       ├── hola/
│       │   └── index.html
│       └── mundo/
│           └── index.html
└── client/              # Assets (compartidos con SSG)
    └── ...
```

**Notas:**

- SSG copia/referencia los assets de `dist/client`
- Los archivos HTML en `dist/static` son servibles directamente (e.g., con nginx, Vercel, Netlify)

---

## 6. Runtime Targets

### 6.1 Soportados en MVP

- ✅ **Node.js** (v18+)
- ✅ **Bun** (v1.0+)

### 6.2 Compatibilidad

El código del framework debe:

- Usar **Web APIs** estándar cuando sea posible (`Request`, `Response`, `URL`, `URLSearchParams`)
- Evitar APIs específicas de Node/Bun en el código core
- Abstraer diferencias de runtime en `@org/hono-adapter` si es necesario

### 6.3 Futuro (post-MVP)

- Cloudflare Workers (requiere adaptaciones para SSR edge)
- Deno (si hay demanda)

---

## 7. Build Commands (Contract)

Los proyectos consumer deben exponer estos scripts (pueden delegarse al CLI):

### 7.1 Development

```bash
npm run dev
# → inicia Hono dev server con Vite HMR y SSR
```

### 7.2 Build SSR

```bash
npm run build
# → genera dist/client y dist/server
```

### 7.3 Build SSG

```bash
npm run build:ssg
# → genera dist/static con HTML prerenderizado
```

### 7.4 Preview

```bash
npm run preview
# → sirve dist/client + dist/server (SSR) o dist/static (SSG)
```

---

## 8. Error Handling

### 8.1 Status codes

- `200`: página renderizada correctamente
- `404`: ruta no encontrada o página devuelve 404 explícitamente
- `500`: error en loader o durante render

### 8.2 Error pages

- 404: `src/pages/404.tsx` (custom) o fallback del framework
- 500: el framework debe capturar errores y mostrar un mensaje genérico en producción
  - En dev: stack trace completo

### 8.3 Loader errors

Si `loader()` lanza un error:

- En **dev:** mostrar error en el navegador
- En **prod:** loggear error y retornar 500

---

## 9. Security

### 9.1 XSS Prevention

- `window.__INITIAL_DATA__` debe serializar JSON de forma segura:
  - Escapar `<`, `>`, `&`, y otros caracteres peligrosos
  - Usar `JSON.stringify()` + replace de caracteres especiales

Ejemplo:

```ts
function safeSerialize(data: any): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}
```

### 9.2 CSRF (futuro)

No incluido en MVP, pero considerar headers de seguridad en `hono-adapter`:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- CSP básico

---

## 10. TypeScript Support

### 10.1 Types provistos por el framework

```ts
// De @org/ssr-runtime
export interface LoaderContext {
  request: Request;
  url: URL;
  params: Record<string, string>;
  query: URLSearchParams;
}

export type PageProps<T = any> = {
  data: T;
};

export type GetStaticPaths = () => Promise<Array<{ params: Record<string, string> }>>;
```

### 10.2 Configuración recomendada (en consumer project)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "types": ["vite/client"]
  }
}
```

---

## 11. Versioning

### 11.1 Convenciones v1 (este documento)

- **Alcance:** MVP (Fases 1-5)
- **Cambios breaking:** requieren crear `CONVENTIONS_v2.md`

### 11.2 Package versioning

- Seguir **Semantic Versioning** (semver)
- MVP inicial: `0.1.0` (pre-1.0 permite breaking changes en minor)
- Primera release estable: `1.0.0`

---

## 12. Extensibility (Post-MVP)

Puntos de extensión a considerar en el futuro:

### 12.1 Hooks

```ts
// En server.ts
createHonoApp({
  onBeforeRender: (ctx) => {
    // Modificar contexto antes del render
  },
  onAfterRender: (result) => {
    // Modificar HTML antes de enviar
  },
});
```

### 12.2 Plugins

Permitir que `vite-plugin-pages` acepte plugins para:

- Transformar rutas
- Añadir metadata
- Generar código adicional

---

## 13. Definition of Done — Fase 0

- [x] Convenciones de routing definidas y documentadas
- [x] Contrato de `loader/getStaticPaths/prerender` establecido
- [x] Runtime objetivo decidido (Node + Bun)
- [x] Estructura de output clara (`dist/client`, `dist/server`, `dist/static`)
- [x] Layouts incluidos en MVP (con `layout.tsx`)
- [x] Documento `CONVENTIONS_v1.md` creado y congelado

**Este documento es la fuente de verdad para el desarrollo del MVP.**
