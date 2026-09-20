/// <reference types="vite/client" />

/**
 * Tipos de los modulos virtuales que genera el plugin. Los envia el paquete en
 * vez de copiarse a cada proyecto: son iguales en todos y una copia a mano se
 * queda vieja en cuanto el modulo virtual gana un export.
 *
 * Se enganchan desde el `tsconfig.json` de la aplicacion:
 *
 * ```json
 * { "compilerOptions": { "types": ["@calumet/suamox-vite-plugin-pages/client"] } }
 * ```
 */

declare module "virtual:pages" {
  export const routes: import("@calumet/suamox").RouteRecord[];
  export default routes;
}

declare module "virtual:pages/server" {
  export const routes: import("@calumet/suamox").RouteRecord[];
  export const renderPage: typeof import("@calumet/suamox/server").renderPage;
  export const matchRoute: typeof import("@calumet/suamox").matchRoute;
  export const resolveRouteModule: typeof import("@calumet/suamox").resolveRouteModule;
  export const RedirectResponse: typeof import("@calumet/suamox").RedirectResponse;
  export const base: string;
  export const routeReroute: import("@calumet/suamox").RerouteFn | undefined;
  export const routeVariants: ((pathname: string) => string[]) | undefined;
  export const onRequest:
    | ((
        context: import("@calumet/suamox").MiddlewareContext,
        next: import("@calumet/suamox").MiddlewareNext,
      ) => Promise<Response>)
    | undefined;
  export default routes;
}
