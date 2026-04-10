import type { ApiRouteRecord, RouteRecord } from "./types.js";

export type DefaultPageMode = "ssr" | "ssg" | "csr";

export interface GenerateRoutesOptions {
  defaultMode?: DefaultPageMode;
  base?: string;
  target?: "client" | "server";
  hasMiddleware?: boolean;
  middlewarePath?: string;
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
  } = options;
  const apiRoutes: ApiRouteRecord[] = options.apiRoutes ?? [];
  const defaultPrerender = defaultMode === "ssg";
  const defaultCsr = defaultMode === "csr";
  const declarations: string[] = [];
  const routeObjects: string[] = [];

  routes.forEach((route, index) => {
    const loadPageName = `loadPage${index}`;
    const loadLayoutsName = `loadLayouts${index}`;
    const loadRouteName = `loadRoute${index}`;
    const rawImportPath = route.filePath.replace(/\\/g, "/");
    const clientQuery = target === "client" ? "?__suamox-client-route" : "";
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
    const routeObj = `  {
    path: ${JSON.stringify(route.path)},
    load: ${loadRouteName},
    filePath: ${JSON.stringify(route.filePath)},
    params: ${JSON.stringify(route.params)},
    isCatchAll: ${route.isCatchAll},
    isIndex: ${route.isIndex},
    priority: ${route.priority}${hasLoaderField}${hasLayoutLoadersField}${layoutRouteIdsField}${layoutFilePathsField}
  }`;

    routeObjects.push(routeObj);
  });

  const normalizedBase = base.replace(/\/+$/, "") || "/";

  // En el módulo servidor, re-exportar funciones del runtime para que
  // el prod handler use la misma instancia que las páginas.
  // El middleware solo se incluye en el bundle del servidor, nunca en el cliente.
  const runtimeReExports =
    target === "server"
      ? `\nexport { renderPage, matchRoute, resolveRouteModule, RedirectResponse } from "@calumet/suamox";\n` +
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
    priority: ${route.priority}
  }`);
    });

    apiRoutesCode = `\n${apiDeclarations.join("\n")}\n\nexport const apiRoutes = [\n${apiRouteObjects.join(",\n")}\n];\n`;
  }

  return `${declarations.join("\n")}

export const routes = [
${routeObjects.join(",\n")}
];

export const base = ${JSON.stringify(normalizedBase)};
${runtimeReExports}${apiRoutesCode}
export default routes;
`;
}

/** Exports que son seguros para incluir en el bundle del cliente */
const CLIENT_SAFE_EXPORTS = new Set(["default", "prerender", "csr"]);

/**
 * Genera un modulo proxy que solo re-exporta los exports seguros para el cliente.
 * Esto garantiza que loader(), getStaticPaths() y sus dependencias server-only
 * no entren al bundle del cliente.
 */
export function generateClientProxy(
  originalId: string,
  exportNames: readonly string[],
): string | null {
  const serverExports = exportNames.filter((name) => !CLIENT_SAFE_EXPORTS.has(name));

  if (serverExports.length === 0) {
    return null;
  }

  const safeExports = exportNames.filter((name) => CLIENT_SAFE_EXPORTS.has(name));

  if (safeExports.length === 0) {
    return "export {};";
  }

  return `export { ${safeExports.join(", ")} } from ${JSON.stringify(originalId)};`;
}
