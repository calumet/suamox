# Changelog

## 0.2.0 (2026-03-16)

### Breaking Changes

- **Loaders y `getStaticPaths` son ahora server-only.** Ya no se ejecutan en el navegador durante navegación SPA. El código de loaders no se incluye en el bundle del cliente.
- **`virtual:pages/server`** es el nuevo módulo para el servidor. `entry-server.tsx` debe importar de `virtual:pages/server` en vez de `virtual:pages`.

### Features

- **Endpoint `/__data`**: durante navegación SPA, el router del cliente hace fetch a `GET /__data?path=/ruta` en vez de ejecutar el loader en el browser. El servidor ejecuta el loader y devuelve JSON. Esto resuelve problemas de CORS, variables de entorno inaccesibles y filtración de secretos al cliente.
- **Separación de módulos virtuales**: `virtual:pages` (cliente) no incluye `loader` ni `getStaticPaths`. `virtual:pages/server` (servidor) incluye todo.
- **`hasLoader` en RouteRecord**: el módulo cliente incluye un flag `hasLoader` para que el router sepa que debe hacer fetch al servidor.
- **Template `.gitignore`**: `create-suamox` ahora genera un `.gitignore` en proyectos nuevos.

### Packages

| Paquete                             | Versión anterior | Nueva versión |
| ----------------------------------- | ---------------- | ------------- |
| `@calumet/suamox`                   | 0.1.10           | 0.2.0         |
| `@calumet/suamox-vite-plugin-pages` | 0.1.9            | 0.2.0         |
| `@calumet/suamox-router`            | 0.1.6            | 0.2.0         |
| `@calumet/suamox-hono-adapter`      | 0.1.11           | 0.2.0         |
| `@calumet/suamox-create-app`        | 0.1.3            | 0.2.0         |

### Migration

En proyectos existentes, cambiar `entry-server.tsx`:

```diff
- export { routes } from "virtual:pages";
+ export { routes } from "virtual:pages/server";
```

No se requieren otros cambios. Los loaders siguen funcionando igual desde la perspectiva del desarrollador — la diferencia es que ahora se ejecutan exclusivamente en el servidor.
