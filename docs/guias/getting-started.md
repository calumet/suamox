# Guía de Inicio

Guía rápida y actualizada para empezar con Suamox.

## Requisitos

- Node.js 22+ (recomendado 24)
- pnpm 10+
- Token para GitHub Packages (lectura de paquetes)

## 1) Configurar acceso a GitHub Packages

Suamox se publica en `@calumet` dentro de GitHub Packages.

En tu `.npmrc` de usuario (`~/.npmrc`), agrega:

```ini
@calumet:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
always-auth=true
```

## 2) Crear proyecto (recomendado)

```bash
pnpm dlx @calumet/suamox-create-app my-suamox-app
cd my-suamox-app
pnpm install
pnpm run dev
```

Si pnpm muestra advertencias de scripts bloqueados (por ejemplo `esbuild`), ejecuta:

```bash
pnpm approve-builds
```

## 3) Estructura mínima del proyecto

La plantilla genera esto:

```txt
my-suamox-app/
  src/
    entry-client.tsx
    entry-server.tsx
    pages/
      layout.tsx
      index.tsx
  server.ts
  vite.config.ts
```

## 4) Scripts disponibles

```json
{
  "scripts": {
    "dev": "suamox dev",
    "build": "suamox build",
    "build:ssg": "suamox ssg",
    "preview": "suamox preview",
    "typecheck": "tsc --noEmit"
  }
}
```

Qué hace cada script:

- `dev`: desarrollo con SSR.
- `build`: compila cliente + servidor y luego ejecuta SSG.
- `build:ssg`: ejecuta solo SSG (requiere build previo).
- `preview`: arranca en modo producción (`NODE_ENV=production`).

## 5) Flujo recomendado

Desarrollo:

```bash
pnpm run dev
```

Build y preview:

```bash
pnpm run build
pnpm run preview
```

## 6) Siguientes pasos

- [routing.md](./routing.md): convenciones de rutas y layouts.
- [router.md](./router.md): navegación cliente y API de `startRouter`.
- [head.md](./head.md): manejo de metadatos con `<Head>`.
- [data-loading.md](./data-loading.md): `loader`, `getStaticPaths`, `prerender`, `csr`.
- [ssr.md](./ssr.md): ciclo SSR en dev y producción.
- [ssg.md](./ssg.md): prerender y salida estática.
- [../operaciones/github-packages-checklist.md](../operaciones/github-packages-checklist.md): publicación y versionado en GitHub Packages.
