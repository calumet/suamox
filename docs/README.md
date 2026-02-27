# Documentación de Suamox

Esta carpeta está organizada en dos bloques:

- `guias/`: documentación técnica para construir aplicaciones con Suamox.
- `operaciones/`: guías de publicación, versionado y consumo de paquetes.

## Estructura

```txt
docs/
  README.md
  guias/
    getting-started.md
    routing.md
    router.md
    head.md
    data-loading.md
    ssr.md
    ssg.md
  operaciones/
    github-packages-checklist.md
```

## Orden recomendado de lectura

1. [Guía de inicio](./guias/getting-started.md)
2. [Routing](./guias/routing.md)
3. [Router](./guias/router.md)
4. [Head](./guias/head.md)
5. [Data loading](./guias/data-loading.md)
6. [SSR](./guias/ssr.md)
7. [SSG](./guias/ssg.md)
8. [Publicación en GitHub Packages](./operaciones/github-packages-checklist.md)

## Mantenimiento

- Si cambias APIs de runtime (`@calumet/suamox`), revisa `guias/data-loading.md`, `guias/ssr.md` y `guias/ssg.md`.
- Si cambias convención de rutas o layouts, revisa `guias/routing.md`.
- Si cambias flujo de release/publicación, revisa `operaciones/github-packages-checklist.md` y `CONTRIBUTING.md`.
