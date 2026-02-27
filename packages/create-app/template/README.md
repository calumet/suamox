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

## Inicio Rápido

```bash
pnpm install
pnpm run dev
```

Abre `http://localhost:3000`.

## Scripts

- `pnpm run dev`: Inicia servidor de desarrollo con SSR.
- `pnpm run build`: Compila bundles de cliente y servidor.
- `pnpm run build:ssg`: Genera salida estática (SSG).
- `pnpm run preview`: Previsualiza salida de producción.
- `pnpm run typecheck`: Ejecuta validaciones de TypeScript.

## Estructura del Proyecto

```txt
src/
  entry-client.tsx   # Bootstrap del cliente
  entry-server.tsx   # Entry del manifest de rutas del servidor
  pages/
    layout.tsx       # Layout raíz
    index.tsx        # Página de inicio (/)
server.ts            # Entry del servidor Hono
vite.config.ts       # Vite + plugin suamoxPages
```

## Convenciones de Routing

- Los archivos bajo `src/pages` definen rutas.
- `index.tsx` corresponde a `/`.
- Los params dinámicos usan `[param].tsx`.
- Las rutas catch-all usan `[...all].tsx`.
- Carpetas de grupo como `(admin)` no afectan segmentos de URL.

## Siguientes Pasos

1. Agrega nuevas páginas en `src/pages`.
2. Agrega `loader()` y `getStaticPaths()` donde haga falta.
3. Actualiza metadatos con `<Head>` desde `@calumet/suamox-head`.
