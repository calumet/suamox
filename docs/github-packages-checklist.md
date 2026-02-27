# GitHub Packages Checklist (@calumet)

## 1) Scope y nombres de paquetes

- Confirmar que todos los paquetes usan `@calumet/suamox...`.
- Confirmar que imports internos y docs usan `@calumet/suamox...`.

## 2) Configuracion npm para GitHub Packages

- En el repo (`.npmrc`):
  - `@calumet:registry=https://npm.pkg.github.com`
- Para auth (no commitear token en el repo):
  - User-level (`~/.npmrc`) o CI:
    - `//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}`
- En CI, exponer `GITHUB_TOKEN` (o un PAT con `write:packages`).

## 3) Versionado por breaking change

- Tratar el cambio `@suamox/* -> @calumet/suamox*` como breaking change.
- Subir version major en paquetes publicados (ejemplo: `0.x` a `1.0.0` cuando aplique en tu estrategia).
- Publicar release notes con tabla de migracion.

## 4) Publicacion

- Build de workspace:
  - `pnpm --filter "@calumet/suamox*" build`
- Publicar paquetes:
  - `pnpm -r --filter "@calumet/suamox*" publish --no-git-checks`

## 5) Migracion para consumidores

- Reemplazar dependencias:
  - `@suamox/*` -> `@calumet/suamox*`
- Reemplazar imports:
  - `from '@suamox/...'` -> `from '@calumet/suamox...'`
- Si usan GitHub Packages, agregar en su `.npmrc`:
  - `@calumet:registry=https://npm.pkg.github.com`
