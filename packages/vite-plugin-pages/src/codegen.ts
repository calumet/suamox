import type { ApiRouteRecord, RouteRecord } from "./types.js";

export type DefaultPageMode = "ssr" | "ssg" | "csr";

/** Query string que el codegen agrega a los imports del cliente para activar el stripping */
export const CLIENT_ROUTE_QUERY = "__suamox-client-route";

export interface GenerateRoutesOptions {
  defaultMode?: DefaultPageMode;
  base?: string;
  target?: "client" | "server";
  hasMiddleware?: boolean;
  middlewarePath?: string;
  reroutePath?: string;
  apiRoutes?: ApiRouteRecord[];
}

/**
 * Genera el código del módulo virtual de rutas
 */
export function generateRoutesModule(
  routes: RouteRecord[],
  options: GenerateRoutesOptions = {},
): string {
  const {
    defaultMode = "ssr",
    base = "/",
    target = "client",
    hasMiddleware = false,
    middlewarePath,
    reroutePath,
  } = options;
  const apiRoutes: ApiRouteRecord[] = options.apiRoutes ?? [];
  const defaultPrerender = defaultMode === "ssg";
  const defaultCsr = defaultMode === "csr";
  const declarations: string[] = [];
  const routeObjects: string[] = [];

  // Un import por archivo aunque lo compartan muchas rutas. Estatico y no perezoso:
  // un guardia tiene que poder cortar antes de que se cargue el modulo de la pagina
  const middlewareNames = new Map<string, string>();
  const middlewareDeclarations: string[] = [];
  const middlewareChain = (paths: readonly string[] | undefined): string => {
    if (target !== "server" || !paths || paths.length === 0) {
      return "";
    }
    const names = paths.map((path) => {
      const normalized = path.replace(/\\/g, "/");
      let name = middlewareNames.get(normalized);
      if (!name) {
        name = `__mw${middlewareNames.size}`;
        middlewareNames.set(normalized, name);
        middlewareDeclarations.push(`import * as ${name} from ${JSON.stringify(normalized)};`);
      }
      return `${name}.onRequest`;
    });
    return `,\n    middleware: [${names.join(", ")}]`;
  };

  routes.forEach((route, index) => {
    const loadPageName = `loadPage${index}`;
    const loadLayoutsName = `loadLayouts${index}`;
    const loadRouteName = `loadRoute${index}`;
    const rawImportPath = route.filePath.replace(/\\/g, "/");
    const clientQuery = target === "client" ? `?${CLIENT_ROUTE_QUERY}` : "";
    const importPath = `${rawImportPath}${clientQuery}`;
    const layoutLoadCalls: string[] = [];

    declarations.push(`const ${loadPageName} = () => import(${JSON.stringify(importPath)});`);

    if (route.layouts) {
      route.layouts.forEach((layoutPath, layoutIndex) => {
        const layoutLoaderName = `loadLayout${index}_${layoutIndex}`;
        const layoutImportPath = `${layoutPath.replace(/\\/g, "/")}${clientQuery}`;

        declarations.push(
          `const ${layoutLoaderName} = () => import(${JSON.stringify(layoutImportPath)});`,
        );
        layoutLoadCalls.push(`${layoutLoaderName}()`);
      });
    }

    // Cargar modules completos para poder extraer loader en server
    const layoutsValue =
      layoutLoadCalls.length > 0
        ? `Promise.all([${layoutLoadCalls.join(", ")}])`
        : "Promise.resolve([])";

    declarations.push(`const ${loadLayoutsName} = () => ${layoutsValue};`);

    const serverOnlyFields =
      target === "server"
        ? `
    loader: _module.loader,
    getStaticPaths: _module.getStaticPaths,`
        : "";

    const layoutMetas = (route.layoutMetas ?? []) as Array<{ routeId: string; hasLoader: boolean }>;
    const layoutRouteIds: string[] = layoutMetas.map((m) => m.routeId);

    const layoutInfosField =
      layoutMetas.length > 0
        ? target === "server"
          ? `
    layoutInfos: _layoutModules.map((mod, i) => ({
      component: mod.default,
      loader: mod.loader,
      routeId: ${JSON.stringify(layoutRouteIds)}[i],
      hasLoader: typeof mod.loader === 'function',
    })),`
          : `
    layoutInfos: _layoutModules.map((mod, i) => ({
      component: mod.default,
      routeId: ${JSON.stringify(layoutRouteIds)}[i],
    })),`
        : "";

    declarations.push(`const ${loadRouteName} = async () => {
  const _module = await ${loadPageName}();
  const _layoutModules = await ${loadLayoutsName}();
  const _hasPrerender = 'prerender' in _module;
  const _hasCsr = 'csr' in _module;
  const _prerender = _hasPrerender ? _module.prerender === true : ${defaultPrerender};
  const _csr = _hasCsr ? _module.csr === true : ${defaultCsr ? "!_prerender" : "false"};
  return {
    component: _module.default,${serverOnlyFields}
    prerender: _prerender,
    csr: _csr,
    layouts: _layoutModules.map((mod) => mod.default),${layoutInfosField}
  };
};`);

    // Generar objeto de ruta
    const hasLoaderField = route.hasLoader ? `,\n    hasLoader: true` : "";
    const hasLayoutLoaders = layoutMetas.some((m) => m.hasLoader);
    const hasLayoutLoadersField = hasLayoutLoaders ? `,\n    hasLayoutLoaders: true` : "";
    const layoutRouteIdsField =
      layoutRouteIds.length > 0 ? `,\n    layoutRouteIds: ${JSON.stringify(layoutRouteIds)}` : "";
    const layoutFilePathsField =
      (route.layouts ?? []).length > 0
        ? `,\n    layoutFilePaths: ${JSON.stringify(route.layouts)}`
        : "";
    // La bandera va en los dos targets: el router la mira para decidir si pide
    // `/__data`, y sin eso el guardia no correria al navegar dentro de la SPA
    const hasMiddlewareField =
      (route.middlewares ?? []).length > 0 ? `,\n    hasMiddleware: true` : "";
    const routeObj = `  {
    path: ${JSON.stringify(route.path)},
    load: ${loadRouteName},
    filePath: ${JSON.stringify(route.filePath)},
    params: ${JSON.stringify(route.params)},
    isCatchAll: ${route.isCatchAll},
    isIndex: ${route.isIndex},
    priority: ${route.priority}${hasLoaderField}${hasLayoutLoadersField}${layoutRouteIdsField}${layoutFilePathsField}${hasMiddlewareField}${middlewareChain(route.middlewares)}
  }`;

    routeObjects.push(routeObj);
  });

  const normalizedBase = base.replace(/\/+$/, "") || "/";

  // El reroute va en los dos modulos, al reves que el middleware: si solo lo
  // registrara el servidor, el cliente casaria otra ruta al hidratar.
  const rerouteCode = reroutePath
    ? `import * as __reroute from ${JSON.stringify(reroutePath)};\n` +
      `import { registerReroute } from "@calumet/suamox";\n` +
      `registerReroute(__reroute.reroute);\n`
    : "";

  // El SSG corre fuera de este bundle, con otra instancia del runtime, asi que
  // el registro de arriba no le llega: necesita las funciones para registrarlas
  const rerouteExports =
    target === "server" && reroutePath
      ? `export const routeReroute = __reroute.reroute;\n` +
        `export const routeVariants = __reroute.variants;\n`
      : "";

  // En el módulo servidor, re-exportar funciones del runtime para que
  // el prod handler use la misma instancia que las páginas.
  // El middleware solo se incluye en el bundle del servidor, nunca en el cliente.
  const runtimeReExports =
    target === "server"
      ? `\nexport { matchRoute, resolveRouteModule, RedirectResponse } from "@calumet/suamox";\n` +
        `export { renderPage } from "@calumet/suamox/server";\n` +
        (hasMiddleware && middlewarePath
          ? `export { onRequest } from ${JSON.stringify(middlewarePath)};\n`
          : "")
      : "";

  // API routes: solo en el modulo del servidor
  let apiRoutesCode = "";
  if (target === "server" && apiRoutes && apiRoutes.length > 0) {
    const apiDeclarations: string[] = [];
    const apiRouteObjects: string[] = [];

    apiRoutes.forEach((route, index) => {
      const importPath = route.filePath.replace(/\\/g, "/");
      apiDeclarations.push(`import * as _api${index} from ${JSON.stringify(importPath)};`);

      const methodsEntries = route.httpMethods.map((m) => `${m}: _api${index}.${m}`).join(", ");

      apiRouteObjects.push(`  {
    path: ${JSON.stringify(route.path)},
    type: "api",
    filePath: ${JSON.stringify(route.filePath)},
    methods: { ${methodsEntries} },
    params: ${JSON.stringify(route.params)},
    isCatchAll: ${route.isCatchAll},
    isIndex: ${route.isIndex},
    priority: ${route.priority}${middlewareChain(route.middlewares)}
  }`);
    });

    apiRoutesCode = `\n${apiDeclarations.join("\n")}\n\nexport const apiRoutes = [\n${apiRouteObjects.join(",\n")}\n];\n`;
  }

  return `${declarations.join("\n")}
${middlewareDeclarations.join("\n")}
${rerouteCode}
export const routes = [
${routeObjects.join(",\n")}
];

export const base = ${JSON.stringify(normalizedBase)};
${rerouteExports}${runtimeReExports}${apiRoutesCode}
export default routes;
`;
}
