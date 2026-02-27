# Contribuir a Suamox

Gracias por tu interés en contribuir a Suamox.

## Configuración de Desarrollo

1. Haz fork y clona el repositorio.
2. Instala dependencias:
   ```bash
   pnpm install
   ```
3. Compila todos los paquetes:
   ```bash
   pnpm build
   ```
4. Ejecuta type checking:
   ```bash
   pnpm typecheck
   ```

## Estructura del Proyecto

```txt
suamox/
  packages/             # Paquetes principales del framework
    vite-plugin-pages/  # Plugin de rutas por sistema de archivos
    ssr-runtime/        # Runtime de SSR/SSG
    hono-adapter/       # Adaptador de servidor Hono
  examples/             # Proyectos de ejemplo
  docs/
    guias/              # Guías técnicas (uso del framework)
    operaciones/        # Publicación, versionado y checklist
  CONVENTIONS_v1.md     # Convenciones del framework (congeladas)
```

## Flujo de Desarrollo

### Realizar Cambios

1. Crea una rama nueva para tu feature o fix.
2. Haz los cambios en el paquete correspondiente.
3. Ejecuta type checking: `pnpm typecheck`
4. Ejecuta linting: `pnpm lint`
5. Formatea código: `pnpm format`
6. Compila paquetes: `pnpm build`
7. Ejecuta tests: `pnpm test`

### Desarrollo de Paquetes

Cada paquete tiene su propio modo de desarrollo:

```bash
# Modo watch para un paquete específico
cd packages/vite-plugin-pages
pnpm dev

# O watch para todos los paquetes en paralelo
pnpm dev
```

### Probar Cambios

Usa los proyectos de ejemplo para validar tus cambios:

```bash
cd examples/basic
pnpm dev
```

## Convenciones

Lee [CONVENTIONS_v1.md](./CONVENTIONS_v1.md) para revisar las decisiones de diseño y las convenciones del framework. Están congeladas para el MVP y no deberían cambiarse sin discusión previa.

## Estilo de Código

- Usa TypeScript para todo el código.
- Sigue el estilo de código existente.
- Usa nombres de variables y funciones claros.
- Agrega comentarios JSDoc para APIs públicas.
- Prefija parámetros no usados con `_`.

## Mensajes de Commit

Usa mensajes claros y descriptivos:

- `feat: add route matching logic`
- `fix: correct parameter parsing in dynamic routes`
- `docs: update routing documentation`
- `refactor: simplify route priority sorting`
- `test: add tests for catch-all routes`

## Pull Requests

1. Asegura que todos los checks pasen (typecheck, build).
2. Actualiza documentación si aplica.
3. Agrega tests para funcionalidades nuevas.
4. Referencia issues relacionados.

## Versionado y Publicación

- Los paquetes se publican en GitHub Packages bajo `@calumet/suamox*`.
- No republíques una versión existente. Una vez publicado `x.y.z`, ese número no se puede sobrescribir con código nuevo.
- Para cualquier cambio publicable, incrementa versión en su `package.json` antes de publicar.
- Política sugerida de versionado:
  - `patch` para correcciones (`0.1.0 -> 0.1.1`)
  - `minor` para features retrocompatibles (`0.1.x -> 0.2.0`)
  - `major` para cambios incompatibles (o un minor bien documentado mientras sigas en `0.x`)
- Las dependencias del template de `create-app` deben mantenerse con rango semver (`^0.1.0`) para evitar cambios del template en cada patch.
- Ejemplos de publicación:
  - Paquete único: `pnpm --filter @calumet/suamox-cli publish --no-git-checks`
  - Todos los paquetes del framework: `pnpm -r --filter "@calumet/suamox*" publish --no-git-checks`

## ¿Preguntas?

Puedes abrir un issue para discutir antes de empezar cambios grandes.
