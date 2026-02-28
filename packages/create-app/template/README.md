<!-- prettier-ignore -->
# __NAME__

Aplicación inicial construida con Suamox, Vite, React y Hono.

## Requisitos

- Node.js 22+ (24 recomendado)
- pnpm 10+

## Autenticación en GitHub Packages

Esta plantilla ya incluye un `.npmrc` de proyecto con:

```ini
@calumet:registry=https://npm.pkg.github.com
```

Igualmente necesitas autenticación en tu `~/.npmrc` de usuario (o en CI):

```ini
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

`GITHUB_TOKEN` debe ser un Personal Access Token con permisos de lectura de paquetes.

## Inicio rápido

```bash
pnpm install
pnpm run dev
```

Abre `http://localhost:3000`.

## Scripts

- `pnpm run dev`: inicia servidor de desarrollo con SSR.
- `pnpm run build`: compila cliente + servidor y luego ejecuta SSG.
- `pnpm run build:ssg`: genera salida estática (SSG).
- `pnpm run preview`: previsualiza salida de producción.
- `pnpm run typecheck`: ejecuta validaciones de TypeScript.

## Estructura del proyecto

```txt
src/
  entry-client.tsx   # Bootstrap del cliente
  entry-server.tsx   # Entry del manifest de rutas del servidor
  styles/
    global.css       # Estilos globales
  pages/
    layout.tsx       # Layout raíz
    index.tsx        # Página de inicio (/)
server.ts            # Entry del servidor Hono
vite.config.ts       # Vite + plugin suamoxPages
```

## CSS

- Importa estilos globales desde `src/entry-client.tsx`.
- Para estilos por componente/página usa `*.module.css`.
- En build/SSR/SSG Suamox resuelve CSS usando el manifest de Vite.

## Convenciones de routing

- Los archivos bajo `src/pages` definen rutas.
- `index.tsx` corresponde a `/`.
- Los params dinámicos usan `[param].tsx`.
- Las rutas catch-all usan `[...all].tsx`.
- Carpetas de grupo como `(admin)` no afectan segmentos de URL.

## Siguientes pasos

1. Agrega nuevas páginas en `src/pages`.
2. Agrega `loader()` y `getStaticPaths()` donde haga falta.
3. Actualiza metadatos con `<Head>` desde `@calumet/suamox-head`.
