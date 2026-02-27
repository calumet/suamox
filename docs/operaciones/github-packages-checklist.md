# Publicación en GitHub Packages

Guía práctica para publicar y consumir los paquetes `@calumet/suamox*`.

## 1) Requisitos de autenticación

Para npm registry de GitHub Packages se requiere token, incluso en paquetes públicos.

En `~/.npmrc` (usuario):

```ini
@calumet:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
always-auth=true
```

## 2) Regla de versionado (obligatoria)

- No puedes sobrescribir una versión publicada.
- Si hay cambios en un paquete publicable, incrementa su versión en `package.json`.
- Para criterios y ejemplos completos, consulta [CONTRIBUTING.md](../../CONTRIBUTING.md) en la sección `Versionado y Publicación`.

Sugerencia:

- `patch`: fix (`0.1.0 -> 0.1.1`)
- `minor`: feature compatible (`0.1.x -> 0.2.0`)
- `major`: cambio incompatible

## 3) Build y pruebas antes de publicar

```bash
pnpm --filter "@calumet/suamox*" build
pnpm -r test
```

## 4) Publicación manual

Paquete único:

```bash
pnpm --filter @calumet/suamox-cli publish --no-git-checks
```

Todos los paquetes del framework:

```bash
pnpm -r --filter "@calumet/suamox*" publish --no-git-checks
```

## 5) Verificación en registry

```bash
pnpm view @calumet/suamox version --registry=https://npm.pkg.github.com
pnpm view @calumet/suamox-cli version --registry=https://npm.pkg.github.com
pnpm view @calumet/suamox-create-app version --registry=https://npm.pkg.github.com
```

## 6) Consumo desde proyectos externos

Instalar create-app:

```bash
pnpm dlx @calumet/suamox-create-app my-suamox-app
```

Si deseas forzar una versión concreta:

```bash
pnpm dlx @calumet/suamox-create-app@0.1.1 my-suamox-app
```

## 7) CI (GitHub Actions)

Recomendado:

- `actions/setup-node@v6`
- `pnpm/action-setup@v4`
- `node-version: 24`
- permisos:
  - `contents: read`
  - `packages: write`

Variables:

- `NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`

## 8) Troubleshooting rápido

- `ERR_PNPM_FETCH_404`: scope sin registry o paquete no publicado.
- `E401 Unauthorized`: token inválido/sin permisos.
- `Already up to date` con fix no aplicado: probablemente no publicaste una nueva versión.
