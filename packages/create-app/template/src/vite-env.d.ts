/// <reference types="vite/client" />

declare module "virtual:pages" {
  export const routes: import("@calumet/suamox").RouteRecord[];
  export default routes;
}

declare module "virtual:pages/server" {
  export const routes: import("@calumet/suamox").RouteRecord[];
  export const renderPage: typeof import("@calumet/suamox").renderPage;
  export const matchRoute: typeof import("@calumet/suamox").matchRoute;
  export const resolveRouteModule: typeof import("@calumet/suamox").resolveRouteModule;
  export const RedirectResponse: typeof import("@calumet/suamox").RedirectResponse;
  export default routes;
}
