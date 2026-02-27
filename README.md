# Suamox Framework

Meta-framework con SSR/SSG, enrutado por sistema de archivos y layouts sobre Vite, React y Hono.

## Estado

En desarrollo activo. Las fases 0-6 están implementadas; las Islas (fase 7) están planificadas.

## Inicio Rápido

```bash
pnpm dlx @calumet/suamox-create-app my-suamox-app
cd my-suamox-app
pnpm install
pnpm run dev
```

Consulta `docs/README.md` para el índice completo de documentación.

## Estructura del Proyecto

```txt
suamox/
  packages/
    vite-plugin-pages/   # Plugin de rutas por sistema de archivos
    ssr-runtime/         # Runtime de SSR/SSG
    hono-adapter/        # Adaptador de servidor Hono
    head/                # Gestión de head (SSR/SSG/CSR)
    router/              # Router del cliente
    cli/                 # CLI: dev/build/ssg/preview
    create-app/          # Scaffold de proyecto
  examples/
    basic/               # Proyecto de ejemplo
  docs/                  # Documentación
  PLAN.md                # Plan de implementación
  CONVENTIONS_v1.md      # Convenciones del framework (congeladas)
```

## Configuración de Desarrollo

### Requisitos Previos

- Node.js 18+ o Bun 1.0+
- pnpm 10+

### Instalación

```bash
pnpm install
```

### Scripts

```bash
pnpm dev
pnpm build
pnpm typecheck
pnpm lint
pnpm format
pnpm test
```

## Paquetes

### `@calumet/suamox-vite-plugin-pages`

Enrutado por sistema de archivos con rutas estáticas, dinámicas, catch-all y grupos de rutas.

### `@calumet/suamox`

Match de rutas, loaders, renderizado SSR y prerender SSG.

### `@calumet/suamox-hono-adapter`

Servidor de desarrollo con Hono + handler SSR para producción.

### `@calumet/suamox-head`

Gestión de metadatos `<head>` para SSR/SSG/CSR.

### `@calumet/suamox-router`

Router del lado cliente para navegación fluida.

### `@calumet/suamox-cli`

Comandos estandarizados `dev/build/ssg/preview`.

### `@calumet/suamox-create-app`

Scaffold de proyecto con plantilla inicial mínima.

## Hoja de Ruta

- [x] Fase 0: decisiones de diseño y convenciones
- [x] Fase 1: routing y manifest
- [x] Fase 2: runtime SSR
- [x] Fase 3: adaptador Hono (Dev + Prod)
- [x] Fase 4: SSG (prerender)
- [x] Fase 5: layouts
- [x] Fase 6: CLI + Create-app
- [ ] Fase 7: Islas (opcional)

Consulta `PLAN.md` para más detalle.

## Licencia

MIT
