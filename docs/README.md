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
    css.md
    routing.md
    router.md
    reroute.md
    head.md
    data-loading.md
    actions.md
    ssr.md
    ssg.md
  operaciones/
    github-packages-checklist.md
```

## Orden recomendado de lectura

1. [Guía de inicio](./guias/getting-started.md)
2. [CSS](./guias/css.md)
3. [Routing](./guias/routing.md)
4. [Router](./guias/router.md)
5. [Reroute](./guias/reroute.md)
6. [Head](./guias/head.md)
7. [Data loading](./guias/data-loading.md)
8. [Acciones](./guias/actions.md)
9. [SSR](./guias/ssr.md)
10. [SSG](./guias/ssg.md)
11. [Publicación en GitHub Packages](./operaciones/github-packages-checklist.md)

## Mantenimiento

- Si cambias APIs de runtime (`@calumet/suamox`), revisa `guias/data-loading.md`, `guias/ssr.md` y `guias/ssg.md`.
- Si cambias convención de rutas o layouts, revisa `guias/routing.md`.
- Si cambias flujo de release/publicación, revisa `operaciones/github-packages-checklist.md` y `CONTRIBUTING.md`.
