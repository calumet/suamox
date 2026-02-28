/// <reference types="vite/client" />

declare module "virtual:pages" {
  export const routes: import("@calumet/suamox").RouteRecord[];
  export default routes;
}

declare module "virtual:pages/server" {
  export const routes: import("@calumet/suamox").RouteRecord[];
  export default routes;
}
